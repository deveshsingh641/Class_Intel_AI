import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import crypto from "crypto";
import { storage } from "../storage";
import { AuditLogModel } from "../shared/schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

const rawJwtSecret = process.env.SESSION_SECRET;
export const JWT_SECRET =
  rawJwtSecret ||
  (process.env.NODE_ENV === "production"
    ? "default-production-fallback-secret-key-12345"
    : crypto.randomBytes(32).toString("hex"));

if (!rawJwtSecret && process.env.NODE_ENV === "production") {
  console.warn("[warning] SESSION_SECRET is not set in production. Falling back to default key.");
}

export const revokedTokenJtis = new Map<string, number>();

export function isTokenRevoked(jti: string) {
  const now = Date.now();
  const expiresAt = revokedTokenJtis.get(jti);
  if (!expiresAt) return false;
  if (expiresAt <= now) {
    revokedTokenJtis.delete(jti);
    return false;
  }
  return true;
}

export const DEFAULT_ABUSIVE_WORDS = ["idiot", "stupid", "dumb", "bastard", "bloody", "fuck", "shit"];
const ENV_ABUSE_WORDS = process.env.ABUSE_WORDS
  ? process.env.ABUSE_WORDS.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean)
  : [];
export const ABUSIVE_WORDS = ENV_ABUSE_WORDS.length > 0 ? ENV_ABUSE_WORDS : DEFAULT_ABUSIVE_WORDS;

export const upload = multer({
  limits: { fileSize: 25 * 1024 * 1024 },
});

export function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parsePositiveInt(value: unknown, fallback: number) {
  const n = typeof value === "string" ? parseInt(value, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    name: string;
  };
  tokenJti?: string;
  tokenExp?: number;
  file?: any;
}

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
  message?: string;
};

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, keyGenerator, message } = options;
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = keyGenerator ? keyGenerator(req) : req.ip || "unknown";

    const existing = hits.get(key);
    if (!existing || existing.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(max - 1));
      res.setHeader("X-RateLimit-Reset", String(now + windowMs));
      return next();
    }

    existing.count += 1;
    hits.set(key, existing);

    const remaining = Math.max(0, max - existing.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(existing.resetAt));

    if (existing.count > max) {
      return res.status(429).json({
        error: message || "Too many requests. Please try again later.",
      });
    }

    return next();
  };
}

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 25,
  keyGenerator: (req) => {
    const rawEmail = (req.body as any)?.email;
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
    const ip = req.ip || "unknown";
    return email ? `${ip}:${email}` : ip;
  },
  message: "Too many login attempts. Please try again later.",
});

export async function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const jti = typeof decoded?.jti === "string" ? decoded.jti : "";
    if (jti && isTokenRevoked(jti)) {
      return res.status(401).json({ error: "Token has been revoked" });
    }
    const user: NonNullable<AuthRequest["user"]> = {
      id: decoded?.id || decoded?._id || decoded?.userId || "",
      email: decoded?.email || "",
      role: decoded?.role || "",
      name: decoded?.name || "",
    };

    if (!user.id && user.email) {
      const dbUser = await storage.getUserByEmail(user.email);
      if (dbUser) {
        user.id = (dbUser as any).id || (dbUser as any)._id || "";
        user.role = user.role || (dbUser as any).role || "";
        user.name = user.name || (dbUser as any).name || "";
      }
    }

    if (!user.id) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }

    req.user = user;
    req.tokenJti = jti || undefined;
    req.tokenExp = typeof decoded?.exp === "number" ? decoded.exp : undefined;
    next();
  } catch (error) {
    console.error("Token verification error:", error instanceof Error ? error.message : String(error));
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

export async function getTeacherId(user: { id: string; name: string }): Promise<string> {
  const teacherRow =
    (await storage.getTeacher(user.id)) ||
    (await storage.getTeacherByName(user.name)) ||
    (await storage.getTeacherByLooseName(user.name));
  return teacherRow?.id || user.id;
}

export async function recordAuditLog(
  userId: string,
  userName: string,
  userRole: string,
  action: string,
  details?: { target?: string; targetId?: string; detail?: string; ip?: string }
) {
  try {
    await AuditLogModel.create({
      userId,
      userName,
      userRole,
      action,
      target: details?.target,
      targetId: details?.targetId,
      detail: details?.detail,
      ip: details?.ip,
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err);
  }
}
