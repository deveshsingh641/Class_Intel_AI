import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env BEFORE reading any env vars.
// ESM import hoisting means this module may evaluate before index.ts calls dotenv.config().
const __routesDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__routesDir, "..", ".env") });

import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  loginSchema,
  signupSchema,
  insertTeacherSchema,
  insertFeedbackSchema,
  updateTeacherSchema,
  insertReplySchema,
  TeacherModel,
  FeedbackModel,
  UserModel,
  TopicAnalysisModel,
  StudentRiskModel,
  AISuggestionModel,
  SentimentSnapshotModel,
  AlertModel,
  FaceRegistrationModel,
  AttendanceSessionModel,
  AttendanceRecordModel,
  LectureSummaryModel,
  QuizModel,
  QuizAttemptModel,
  StudentPerformanceModel,
  CourseDocumentModel,
  RagChatModel,
  createQuizSchema,
  submitQuizSchema,
} from "@shared/schema";
import { aiService } from "./ai-service";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import multer from "multer";
import OpenAI from "openai";
import csv from "csv-parser";
import { Readable } from "stream";
import crypto from "crypto";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

const rawJwtSecret = process.env.SESSION_SECRET;
const JWT_SECRET =
  rawJwtSecret ||
  (process.env.NODE_ENV === "production"
    ? ""
    : crypto.randomBytes(32).toString("hex"));
if (!JWT_SECRET) {
  throw new Error("SESSION_SECRET must be set in production");
}

console.log("✅ JWT_SECRET loaded from SESSION_SECRET:", rawJwtSecret ? "from .env ✓" : "⚠️ random fallback (will change on restart!)");

const revokedTokenJtis = new Map<string, number>();

function isTokenRevoked(jti: string) {
  const now = Date.now();
  const expiresAt = revokedTokenJtis.get(jti);
  if (!expiresAt) return false;
  if (expiresAt <= now) {
    revokedTokenJtis.delete(jti);
    return false;
  }
  return true;
}

const DEFAULT_ABUSIVE_WORDS = ["idiot", "stupid", "dumb", "bastard", "bloody", "fuck", "shit"];
const ENV_ABUSE_WORDS = process.env.ABUSE_WORDS
  ? process.env.ABUSE_WORDS.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean)
  : [];
const ABUSIVE_WORDS = ENV_ABUSE_WORDS.length > 0 ? ENV_ABUSE_WORDS : DEFAULT_ABUSIVE_WORDS;

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
});

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePositiveInt(value: unknown, fallback: number) {
  const n = typeof value === "string" ? parseInt(value, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

interface AuthRequest extends Request {
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

function createRateLimiter(options: RateLimitOptions) {
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

const authRateLimiter = createRateLimiter({
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

async function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
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

function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Auth Routes
  app.post("/api/auth/signup", authRateLimiter, async (req, res) => {
    try {
      const data = signupSchema.parse(req.body);
      
      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }

      const user = await storage.createUser({
        ...data,
        username: data.email.split("@")[0],
      });

      const jti = crypto.randomUUID();
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name, jti },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          department: user.department,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Signup error:", error);
      res.status(500).json({ error: "Failed to create account" });
    }
  });

  // Office hours / slots
  app.post("/api/office/slots", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
    try {
      // Resolve the actual teacher profile (User ID ≠ Teacher ID)
      const teacherRow =
        (await storage.getTeacher(req.user!.id)) ||
        (await storage.getTeacherByName(req.user!.name)) ||
        (await storage.getTeacherByLooseName(req.user!.name));
      if (!teacherRow) {
        return res.status(404).json({ error: "No teacher profile linked to your account" });
      }
      const { startTime, endTime } = req.body as { startTime?: string; endTime?: string };
      if (!startTime || !endTime) {
        return res.status(400).json({ error: "startTime and endTime are required" });
      }
      const start = new Date(startTime);
      const end = new Date(endTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        return res.status(400).json({ error: "Invalid time range" });
      }
      const slot = await storage.createOfficeSlot({ teacherId: teacherRow.id, startTime: start, endTime: end });
      res.status(201).json(slot);
    } catch (error) {
      console.error("Create office slot error:", error);
      res.status(500).json({ error: "Failed to create slot" });
    }
  });

  app.get("/api/office/slots/:teacherId", async (req, res) => {
    try {
      const slots = await storage.listOfficeSlots(req.params.teacherId);
      res.json(slots);
    } catch (error) {
      console.error("List slots error:", error);
      res.status(500).json({ error: "Failed to list slots" });
    }
  });

  app.post("/api/office/slots/:slotId/book", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
    try {
      const booking = await storage.bookOfficeSlot(req.params.slotId, req.user!.id);
      res.status(201).json(booking);
    } catch (error) {
      console.error("Book slot error:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to book slot" });
    }
  });

  app.get("/api/office/bookings/my", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
    try {
      const bookings = await storage.listMyBookings(req.user!.id);
      res.json(bookings);
    } catch (error) {
      console.error("List my bookings error:", error);
      res.status(500).json({ error: "Failed to list bookings" });
    }
  });

  app.post("/api/office/bookings/:bookingId/cancel", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
    try {
      await storage.cancelBooking(req.params.bookingId, req.user!.id);
      res.json({ ok: true });
    } catch (error) {
      console.error("Cancel booking error:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to cancel booking" });
    }
  });

  // Admin-only: reassign a feedback to a different teacher (for data cleanup)
  app.post("/api/admin/feedback/:feedbackId/reassign", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      const { feedbackId } = req.params;
      const { teacherId } = req.body as { teacherId?: string };
      if (!teacherId || !teacherId.trim()) {
        return res.status(400).json({ error: "teacherId is required" });
      }
      const updated = await storage.updateFeedbackTeacher(feedbackId, teacherId.trim());
      if (!updated) {
        return res.status(404).json({ error: "Feedback not found" });
      }
      res.json({ ok: true, feedback: updated });
    } catch (error) {
      console.error("Reassign feedback error:", error);
      res.status(500).json({ error: "Failed to reassign feedback" });
    }
  });

  // Favorites Routes
  app.get("/api/favorites/my", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
    try {
      const items = await storage.getFavoritesByStudent(req.user!.id);
      res.json(items.map((f) => f.teacherId));
    } catch (error) {
      console.error("Get favorites error:", error);
      res.status(500).json({ error: "Failed to get favorites" });
    }
  });

  app.post("/api/favorites/:teacherId", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
    try {
      const { teacherId } = req.params;
      const favorite = await storage.addFavorite(req.user!.id, teacherId);
      res.status(201).json(favorite);
    } catch (error) {
      console.error("Add favorite error:", error);
      res.status(500).json({ error: "Failed to add favorite" });
    }
  });

  app.delete("/api/favorites/:teacherId", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
    try {
      const { teacherId } = req.params;
      await storage.removeFavorite(req.user!.id, teacherId);
      res.json({ success: true });
    } catch (error) {
      console.error("Remove favorite error:", error);
      res.status(500).json({ error: "Failed to remove favorite" });
    }
  });

  // Doubt Wall Routes
  app.get("/api/doubts/my", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
    try {
      const items = await storage.getDoubtsByStudent(req.user!.id);
      res.json(items);
    } catch (error) {
      console.error("Get student doubts error:", error);
      res.status(500).json({ error: "Failed to get doubts" });
    }
  });

  app.get("/api/doubts/teacher", authenticateToken, requireRole("teacher"), async (req: AuthRequest, res) => {
    try {
      // Resolve the actual teacher profile (User ID ≠ Teacher ID)
      const teacherRow =
        (await storage.getTeacher(req.user!.id)) ||
        (await storage.getTeacherByName(req.user!.name)) ||
        (await storage.getTeacherByLooseName(req.user!.name));
      if (!teacherRow) {
        return res.status(404).json({ error: "No teacher profile linked to your account" });
      }
      const doubts = await storage.getDoubtsByTeacher(teacherRow.id);
      const sorted = doubts
        .map((d) => ({ ...d, teacherName: undefined }))
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      res.json(sorted);
    } catch (error) {
      console.error("Get teacher doubts error:", error);
      res.status(500).json({ error: "Failed to get doubts" });
    }
  });

  app.post("/api/doubts/:id/answer", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
    try {
      const { answer } = req.body as { answer?: string };
      if (!answer || !answer.trim()) {
        return res.status(400).json({ error: "Answer is required" });
      }
      const updated = await storage.answerDoubt(req.params.id, answer.trim());
      res.json(updated);
    } catch (error) {
      console.error("Answer doubt error:", error);
      res.status(500).json({ error: "Failed to answer doubt" });
    }
  });

  app.post("/api/auth/login", authRateLimiter, async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      
      const user = await storage.getUserByEmail(data.email);
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const validPassword = await bcrypt.compare(data.password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const jti = crypto.randomUUID();
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name, jti },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      console.log("✅ Login successful for:", user.email);
      console.log("✅ Token created with exp: 7d, jti:", jti);

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          department: user.department,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  app.post("/api/auth/logout", authenticateToken, async (req: AuthRequest, res) => {
    const jti = req.tokenJti;
    const exp = req.tokenExp;
    if (!jti || !exp) {
      return res.json({ ok: true });
    }
    const expiresAtMs = exp * 1000;
    revokedTokenJtis.set(jti, expiresAtMs);
    res.json({ ok: true });
  });

  // Study Groups
  app.get("/api/study-groups", async (_req, res) => {
    try {
      const groups = await storage.listStudyGroups();
      res.json(groups);
    } catch (error) {
      console.error("List study groups error:", error);
      res.status(500).json({ error: "Failed to list study groups" });
    }
  });

  app.get("/api/study-groups/my", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const groups = await storage.listMyStudyGroups(req.user!.id);
      res.json(groups);
    } catch (error) {
      console.error("List my study groups error:", error);
      res.status(500).json({ error: "Failed to list your study groups" });
    }
  });

  app.post("/api/study-groups", authenticateToken, requireRole("student", "teacher", "admin"), async (req: AuthRequest, res) => {
    try {
      const { name, description, subject, maxMembers, isPrivate, tags } = req.body as any;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Group name is required" });
      }
      if (!subject || typeof subject !== "string" || !subject.trim()) {
        return res.status(400).json({ error: "Subject is required" });
      }

      const group = await storage.createStudyGroup({
        name: name.trim(),
        description: typeof description === "string" ? description.trim() : "",
        subject: subject.trim(),
        creatorId: req.user!.id,
        creatorName: req.user!.name,
        maxMembers: typeof maxMembers === "number" ? maxMembers : undefined,
        isPrivate: !!isPrivate,
        tags: Array.isArray(tags) ? tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim()) : [],
      });

      res.status(201).json(group);
    } catch (error) {
      console.error("Create study group error:", error);
      res.status(500).json({ error: "Failed to create study group" });
    }
  });

  app.post("/api/study-groups/:groupId/join", authenticateToken, requireRole("student", "teacher", "admin"), async (req: AuthRequest, res) => {
    try {
      const group = await storage.joinStudyGroup(req.params.groupId, {
        id: req.user!.id,
        name: req.user!.name,
      });
      res.json(group);
    } catch (error) {
      console.error("Join study group error:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to join study group" });
    }
  });

  // Student Gamification
  app.get("/api/student/gamification", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
    try {
      const stats = await storage.getStudentGamification(req.user!.id);
      res.json(stats);
    } catch (error) {
      console.error("Get student gamification error:", error);
      res.status(500).json({ error: "Failed to load gamification stats" });
    }
  });

  app.post(
    "/api/student/achievements/:achievementId/claim",
    authenticateToken,
    requireRole("student"),
    async (req: AuthRequest, res) => {
      try {
        const result = await storage.claimStudentAchievement(req.user!.id, req.params.achievementId);
        res.json(result);
      } catch (error) {
        console.error("Claim achievement error:", error);
        res.status(400).json({ error: error instanceof Error ? error.message : "Failed to claim achievement" });
      }
    },
  );

  // Teacher Routes
  app.get("/api/teachers", async (_req, res) => {
    try {
      const teachersList = await storage.getTeachers();
      res.json(teachersList);
    } catch (error) {
      console.error("Get teachers error:", error);
      res.status(500).json({ error: "Failed to get teachers" });
    }
  });

  app.get("/api/teachers/departments", async (_req, res) => {
    try {
      const departments = await TeacherModel.distinct("department");
      const sorted = departments
        .filter((d): d is string => typeof d === "string" && d.trim().length > 0)
        .sort((a, b) => a.localeCompare(b));
      res.json(sorted);
    } catch (error) {
      console.error("Get departments error:", error);
      res.status(500).json({ error: "Failed to get departments" });
    }
  });

  // Resolve the teacher profile linked to the logged-in user
  app.get("/api/teachers/me", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
    try {
      const teacherRow =
        (await storage.getTeacher(req.user!.id)) ||
        (await storage.getTeacherByName(req.user!.name)) ||
        (await storage.getTeacherByLooseName(req.user!.name));
      if (!teacherRow) {
        return res.status(404).json({ error: "No teacher profile linked to your account" });
      }
      res.json(teacherRow);
    } catch (error) {
      console.error("Get teacher/me error:", error);
      res.status(500).json({ error: "Failed to resolve teacher profile" });
    }
  });

  app.get("/api/teachers/search", async (req, res) => {
    try {
      const page = parsePositiveInt(req.query.page, 1);
      const limit = Math.min(100, parsePositiveInt(req.query.limit, 18));
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const department = typeof req.query.department === "string" ? req.query.department.trim() : "";
      const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy : "name-asc";
      const minRating = typeof req.query.minRating === "string" ? parseFloat(req.query.minRating) : 0;
      const maxRating = typeof req.query.maxRating === "string" ? parseFloat(req.query.maxRating) : 5;
      const minFeedback = typeof req.query.minFeedback === "string" ? parseInt(req.query.minFeedback, 10) : 0;

      const match: Record<string, any> = {};
      if (q) {
        const safe = escapeRegex(q);
        match.$or = [
          { name: { $regex: safe, $options: "i" } },
          { subject: { $regex: safe, $options: "i" } },
          { department: { $regex: safe, $options: "i" } },
        ];
      }
      if (department && department !== "all") {
        match.department = department;
      }
      if (Number.isFinite(minRating) || Number.isFinite(maxRating)) {
        const min = Number.isFinite(minRating) ? minRating : 0;
        const max = Number.isFinite(maxRating) ? maxRating : 5;
        match.averageRating = { $gte: min, $lte: max };
      }
      if (Number.isFinite(minFeedback) && minFeedback > 0) {
        match.totalFeedback = { $gte: minFeedback };
      }

      const sort: Record<string, 1 | -1> =
        sortBy === "rating-desc"
          ? { averageRating: -1, totalFeedback: -1, name: 1 }
          : sortBy === "rating-asc"
            ? { averageRating: 1, totalFeedback: -1, name: 1 }
            : sortBy === "feedback-desc"
              ? { totalFeedback: -1, averageRating: -1, name: 1 }
              : sortBy === "feedback-asc"
                ? { totalFeedback: 1, averageRating: -1, name: 1 }
                : sortBy === "name-desc"
                  ? { name: -1 }
                  : { name: 1 };

      const skip = (page - 1) * limit;

      const [itemsRaw, total] = await Promise.all([
        TeacherModel.find(match).sort(sort).skip(skip).limit(limit).lean(),
        TeacherModel.countDocuments(match),
      ]);

      const items = itemsRaw.map((t: any) => ({ ...t, id: (t.id ?? t._id)?.toString?.() ?? t._id ?? t.id }));
      res.json({ items, total, page, limit });
    } catch (error) {
      console.error("Search teachers error:", error);
      res.status(500).json({ error: "Failed to search teachers" });
    }
  });

  app.get("/api/teachers/feedback", async (_req, res) => {
    try {
      const teachersList = await storage.getTeachers();
      res.json(teachersList);
    } catch (error) {
      console.error("Get teachers (feedback view) error:", error);
      res.status(500).json({ error: "Failed to get teachers for feedback view" });
    }
  });

  app.get("/api/teachers/:id", async (req, res) => {
    try {
      const teacher = await storage.getTeacher(req.params.id);
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }
      res.json(teacher);
    } catch (error) {
      console.error("Get teacher error:", error);
      res.status(500).json({ error: "Failed to get teacher" });
    }
  });

  app.post("/api/teachers", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      const data = insertTeacherSchema.parse(req.body);
      const teacher = await storage.createTeacher(data);
      res.status(201).json(teacher);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Create teacher error:", error);
      res.status(500).json({ error: "Failed to create teacher" });
    }
  });

  // Bulk import teachers from CSV
  app.post("/api/admin/teachers/bulk-import", authenticateToken, requireRole("admin"), upload.single('file'), async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const teachers: any[] = [];
      const errors: string[] = [];

      // Parse CSV file
      const readableStream = Readable.from(req.file.buffer.toString());
      
      await new Promise((resolve, reject) => {
        readableStream
          .pipe(csv())
          .on('data', (row) => {
            try {
              // Validate required fields
              if (!row.name || !row.email || !row.department || !row.subject) {
                errors.push(`Row with email ${row.email || 'unknown'} missing required fields`);
                return;
              }

              // Validate email format
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!emailRegex.test(row.email)) {
                errors.push(`Invalid email format: ${row.email}`);
                return;
              }

              teachers.push({
                name: row.name.trim(),
                email: row.email.trim().toLowerCase(),
                department: row.department.trim(),
                subject: row.subject.trim(),
                phone: row.phone?.trim() || null,
                bio: row.bio?.trim() || null,
              });
            } catch (error) {
              errors.push(`Error processing row: ${error}`);
            }
          })
          .on('end', resolve)
          .on('error', reject);
      });

      if (errors.length > 0) {
        return res.status(400).json({ 
          error: "CSV validation failed", 
          details: errors 
        });
      }

      // Insert teachers into database
      const createdTeachers = [];
      for (const teacherData of teachers) {
        try {
          const teacher = await storage.createTeacher(teacherData);
          createdTeachers.push(teacher);
        } catch (error) {
          errors.push(`Failed to create teacher ${teacherData.email}: ${error}`);
        }
      }

      if (errors.length > 0) {
        return res.status(207).json({ 
          message: "Partial import completed", 
          imported: createdTeachers.length,
          total: teachers.length,
          errors: errors,
          teachers: createdTeachers
        });
      }

      res.json({
        message: "All teachers imported successfully",
        imported: createdTeachers.length,
        total: teachers.length,
        teachers: createdTeachers
      });

    } catch (error) {
      console.error("Bulk import error:", error);
      res.status(500).json({ error: "Failed to process CSV file" });
    }
  });

  app.put("/api/teachers/:id/profile", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
    try {
      const teacher = await storage.getTeacher(req.params.id);
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      if (req.user!.role === "teacher" && req.user!.id !== teacher.id) {
        return res.status(403).json({ error: "You can only edit your own profile" });
      }

      const updates = updateTeacherSchema.parse(req.body);
      const updated = await storage.updateTeacher(req.params.id, updates);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Update teacher profile error:", error);
      res.status(500).json({ error: "Failed to update teacher profile" });
    }
  });

  app.delete("/api/teachers/:id", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      const teacher = await storage.getTeacher(req.params.id);
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }
      await storage.deleteTeacher(req.params.id);
      res.json({ message: "Teacher deleted successfully" });
    } catch (error) {
      console.error("Delete teacher error:", error);
      res.status(500).json({ error: "Failed to delete teacher" });
    }
  });

  // User Management Routes
  app.get("/api/admin/users", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      const page = parsePositiveInt(req.query.page, 1);
      const limit = Math.min(100, parsePositiveInt(req.query.limit, 20));
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const role = typeof req.query.role === "string" ? req.query.role.trim() : "all";
      const status = typeof req.query.status === "string" ? req.query.status.trim() : "all";
      const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy : "newest";

      const query: any = {};

      if (search) {
        const safe = escapeRegex(search);
        query.$or = [
          { name: { $regex: safe, $options: "i" } },
          { email: { $regex: safe, $options: "i" } },
          { username: { $regex: safe, $options: "i" } },
        ];
      }

      if (role && role !== "all") {
        query.role = role;
      }

      if (status && status !== "all") {
        query.status = status;
      }

      const sortOptions: any = {};
      switch (sortBy) {
        case "oldest": sortOptions.createdAt = 1; break;
        case "name-asc": sortOptions.name = 1; break;
        case "name-desc": sortOptions.name = -1; break;
        case "newest": default: sortOptions.createdAt = -1; break;
      }

      const skip = (page - 1) * limit;

      const [usersRaw, total] = await Promise.all([
        UserModel.find(query).sort(sortOptions).skip(skip).limit(limit).lean(),
        UserModel.countDocuments(query),
      ]);

      const users = usersRaw.map(user => ({
        id: (user as any)._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status || 'active',
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        department: user.department,
      }));

      res.json({
        items: users,
        total,
        page,
        limit
      });
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.patch("/api/admin/users/:userId/status", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      const { status } = req.body;
      const validStatuses = ['active', 'inactive', 'suspended'];
      
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const user = await storage.updateUserStatus(req.params.userId, status);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Update user status error:", error);
      res.status(500).json({ error: "Failed to update user status" });
    }
  });

  app.patch("/api/admin/users/:userId/role", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      const { role } = req.body;
      const validRoles = ['admin', 'teacher', 'student'];
      
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      // Prevent admin from removing their own admin role
      if (req.user!.id === req.params.userId && role !== 'admin') {
        return res.status(400).json({ error: "Cannot remove your own admin role" });
      }

      const user = await storage.updateUserRole(req.params.userId, role);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Update user role error:", error);
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  // Feedback Routes
  app.get("/api/feedback/teacher/:teacherId/summary", async (req, res) => {
    try {
      const { teacherId } = req.params;

      const [total, avgAgg, distAgg, commentAgg] = await Promise.all([
        FeedbackModel.countDocuments({ teacherId }),
        FeedbackModel.aggregate([
          { $match: { teacherId } },
          {
            $group: {
              _id: null,
              averageRating: { $avg: "$rating" },
              positiveCount: {
                $sum: {
                  $cond: [{ $gte: ["$rating", 4] }, 1, 0],
                },
              },
              students: { $addToSet: "$studentId" },
            },
          },
          {
            $project: {
              _id: 0,
              averageRating: { $ifNull: ["$averageRating", 0] },
              positiveCount: { $ifNull: ["$positiveCount", 0] },
              uniqueStudents: { $size: { $ifNull: ["$students", []] } },
            },
          },
        ]),
        FeedbackModel.aggregate([
          { $match: { teacherId } },
          { $group: { _id: "$rating", count: { $sum: 1 } } },
        ]),
        FeedbackModel.aggregate([
          { $match: { teacherId, comment: { $type: "string", $ne: "" } } },
          { $project: { len: { $strLenCP: "$comment" } } },
          { $group: { _id: null, avgCommentLength: { $avg: "$len" } } },
          { $project: { _id: 0, avgCommentLength: { $ifNull: ["$avgCommentLength", 0] } } },
        ]),
      ]);

      const avgRow = (avgAgg?.[0] || {}) as {
        averageRating?: number;
        positiveCount?: number;
        uniqueStudents?: number;
      };

      const distMap = new Map<number, number>(
        (distAgg || [])
          .filter((r: any) => typeof r?._id === "number")
          .map((r: any) => [r._id as number, r.count as number]),
      );
      const ratingDistribution = [5, 4, 3, 2, 1].map((rating) => ({
        rating,
        count: distMap.get(rating) ?? 0,
      }));

      const avgCommentLength = Number((commentAgg?.[0] as any)?.avgCommentLength ?? 0);

      const [recentRows, olderRows] = await Promise.all([
        FeedbackModel.find({ teacherId }).sort({ createdAt: -1 }).limit(20).select("rating").lean(),
        FeedbackModel.find({ teacherId }).sort({ createdAt: -1 }).skip(20).limit(20).select("rating").lean(),
      ]);
      const recentAvg =
        recentRows.length > 0
          ? recentRows.reduce((sum: number, r: any) => sum + (r.rating ?? 0), 0) / recentRows.length
          : 0;
      const olderAvg =
        olderRows.length > 0
          ? olderRows.reduce((sum: number, r: any) => sum + (r.rating ?? 0), 0) / olderRows.length
          : 0;
      const ratingTrend = recentRows.length > 0 && olderRows.length > 0 ? recentAvg - olderAvg : 0;

      res.json({
        total,
        averageRating: Number(avgRow.averageRating ?? 0),
        positiveCount: Number(avgRow.positiveCount ?? 0),
        uniqueStudents: Number(avgRow.uniqueStudents ?? 0),
        avgCommentLength,
        ratingDistribution,
        ratingTrend,
      });
    } catch (error) {
      console.error("Get teacher feedback summary error:", error);
      res.status(500).json({ error: "Failed to get teacher feedback summary" });
    }
  });

  app.get("/api/feedback/teacher/:teacherId/paged", async (req, res) => {
    try {
      const { teacherId } = req.params;
      const page = parsePositiveInt(req.query.page, 1);
      const limit = Math.min(100, parsePositiveInt(req.query.limit, 20));
      const minRating = typeof req.query.minRating === "string" ? parseFloat(req.query.minRating) : 0;
      const maxRating = typeof req.query.maxRating === "string" ? parseFloat(req.query.maxRating) : 5;
      const subject = typeof req.query.subject === "string" ? req.query.subject.trim() : "";
      const hasComment = req.query.hasComment === "true";
      const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy : "newest";

      const query: any = { teacherId };
      if (Number.isFinite(minRating) || Number.isFinite(maxRating)) {
         query.rating = { $gte: minRating || 0, $lte: maxRating || 5 };
      }
      if (subject && subject !== "all") {
        query.subject = subject;
      }
      if (hasComment) {
        query.comment = { $exists: true, $ne: "" };
      }

      const sortOptions: any = {};
      switch (sortBy) {
        case "oldest": sortOptions.createdAt = 1; break;
        case "rating-desc": sortOptions.rating = -1; break;
        case "rating-asc": sortOptions.rating = 1; break;
        case "newest": default: sortOptions.createdAt = -1; break;
      }

      const skip = (page - 1) * limit;

      const [itemsRaw, total] = await Promise.all([
        FeedbackModel.find(query).sort(sortOptions).skip(skip).limit(limit).lean(),
        FeedbackModel.countDocuments(query),
      ]);

      const items = itemsRaw.map((item: any) => {
        const commentLen = (item.comment || "").length;
        const qualityScore = Math.min(5, Math.max(1, Math.round((commentLen / 50) + item.rating / 2)));
        const hasComment = commentLen > 0;
        return {
          ...item,
          id: (item.id ?? item._id)?.toString?.() ?? item._id ?? item.id,
          qualityScore,
          commentLength: commentLen,
          hasComment,
        };
      });

      res.json({ items, total, page, limit });
    } catch (error) {
      console.error("Get teacher feedback paged error:", error);
      res.status(500).json({ error: "Failed to get teacher feedback" });
    }
  });

  app.get("/api/feedback/my-submissions", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const teacherIds = await storage.getStudentFeedbackTeachers(req.user!.id);
      res.json(teacherIds);
    } catch (error) {
      console.error("Get submissions error:", error);
      res.status(500).json({ error: "Failed to get submissions" });
    }
  });

  // All feedback submitted by current student (with teacher names)
  app.get("/api/feedback/my", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
    try {
      const [feedbackList, teachersList] = await Promise.all([
        storage.getFeedbackByStudent(req.user!.id),
        storage.getTeachers(),
      ]);

      // Map teachers by both id and _id to handle lean docs that may not include .id
      const teacherMap = new Map<string, typeof teachersList[number]>();
      for (const t of teachersList) {
        const id = (t as any).id;
        const _id = (t as any)._id;
        if (id) teacherMap.set(id, t);
        if (_id) teacherMap.set(_id, t);
      }

      const result = feedbackList.map((fb) => {
        const teacher = teacherMap.get(fb.teacherId);
        return {
          ...fb,
          teacherName: teacher?.name || "Unknown Teacher",
          department: teacher?.department || null,
          subject: teacher?.subject || null,
        };
      });

      res.json(result);
    } catch (error) {
      console.error("Get my feedback error:", error);
      res.status(500).json({ error: "Failed to get your feedback" });
    }
  });

  // Mark feedback as read (teacher/admin)
  app.post(
    "/api/feedback/:feedbackId/read",
    authenticateToken,
    requireRole("teacher", "admin"),
    async (req: AuthRequest, res) => {
      try {
        const { feedbackId } = req.params;
        const updated = await storage.markFeedbackRead(feedbackId);
        res.json({ feedback: updated || null });
      } catch (error) {
        console.error("Mark feedback read error:", error);
        res.status(500).json({ error: "Failed to mark feedback as read" });
      }
    }
  );

  // Flag feedback (any authenticated user)
  app.post("/api/feedback/:feedbackId/flag", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { feedbackId } = req.params;
      const { reason } = (req.body || {}) as { reason?: string };
      await storage.createFeedbackFlag({
        feedbackId,
        userId: req.user!.id,
        reason: typeof reason === "string" ? reason.slice(0, 500) : null,
      });
      res.json({ ok: true });
    } catch (error) {
      console.error("Flag feedback error:", error);
      res.status(500).json({ error: "Failed to flag feedback" });
    }
  });

  // Admin: list flags
  app.get("/api/feedback/flags", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const flags = await storage.getFeedbackFlagsDetailed(status);
      res.json(flags);
    } catch (error) {
      console.error("Get feedback flags error:", error);
      res.status(500).json({ error: "Failed to get feedback flags" });
    }
  });

  // Admin: update flag status
  app.post("/api/feedback/flags/:flagId/status", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      const { flagId } = req.params;
      const { status } = req.body as { status?: string };
      if (!status) {
        return res.status(400).json({ error: "Status is required" });
      }
      await storage.updateFeedbackFlagStatus(flagId, status);
      res.json({ ok: true });
    } catch (error) {
      console.error("Update feedback flag status error:", error);
      res.status(500).json({ error: "Failed to update flag status" });
    }
  });

  // Mark feedback as resolved (student)
  app.post(
    "/api/feedback/:feedbackId/resolve",
    authenticateToken,
    requireRole("student"),
    async (req: AuthRequest, res) => {
      try {
        const { feedbackId } = req.params;
        const updated = await storage.markFeedbackResolved(feedbackId, req.user!.id);
        if (!updated) {
          return res.status(404).json({ error: "Feedback not found" });
        }
        res.json({ feedback: updated });
      } catch (error) {
        console.error("Mark feedback resolved error:", error);
        res.status(500).json({ error: "Failed to mark feedback as resolved" });
      }
    }
  );

  // Feedback reminder status for current student
  app.get("/api/feedback/reminder-status", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
    try {
      const feedbackList = await storage.getFeedbackByStudent(req.user!.id);

      if (feedbackList.length === 0) {
        return res.json({
          needsReminder: true,
          lastFeedbackDate: null,
          daysSinceLastFeedback: null,
        });
      }

      const last = feedbackList[0];
      const lastDate = new Date(last.createdAt!);
      const now = new Date();
      const diffMs = now.getTime() - lastDate.getTime();
      const daysSince = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      const THRESHOLD_DAYS = 7;

      res.json({
        needsReminder: daysSince >= THRESHOLD_DAYS,
        lastFeedbackDate: lastDate.toISOString(),
        daysSinceLastFeedback: daysSince,
      });
    } catch (error) {
      console.error("Get feedback reminder status error:", error);
      res.status(500).json({ error: "Failed to get feedback reminder status" });
    }
  });

  app.get("/api/feedback/transcribe-enabled", (_req, res) => {
    const enabled = !!process.env.OPENAI_API_KEY;
    res.json({ enabled });
  });

  interface UploadedAudioFile {
    buffer: Buffer;
    mimetype?: string;
  }

  app.post(
    "/api/feedback/transcribe",
    authenticateToken,
    requireRole("student"),
    upload.single("audio"),
    async (req: AuthRequest, res) => {
      try {
        if (!process.env.OPENAI_API_KEY) {
          return res.status(500).json({ error: "Transcription service not configured" });
        }

        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });

        const file = (req as any).file as UploadedAudioFile | undefined;
        if (!file) {
          return res.status(400).json({ error: "Audio file is required" });
        }

        const audioBlob = new Blob([file.buffer as any], {
          type: file.mimetype || "audio/webm",
        });

        const response = await openai.audio.transcriptions.create({
          file: audioBlob as any,
          model: "gpt-4o-transcribe",
        });

        const transcript = (response as any).text || "";

        if (!transcript.trim()) {
          return res.status(500).json({ error: "Could not generate transcription" });
        }

        res.json({ transcript });
      } catch (error: any) {
        console.error("Transcription error:", error);
        res.status(500).json({
          error: error?.message || "Failed to transcribe audio. Please try again.",
        });
      }
    }
  );

  app.post("/api/feedback", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
    try {
      // Normalize empty comment strings to undefined
      const body = {
        ...req.body,
        comment: req.body.comment && req.body.comment.trim() ? req.body.comment.trim() : undefined,
        doubt: req.body.doubt && req.body.doubt.trim() ? req.body.doubt.trim() : undefined,
      };
      
      console.log("Feedback submission request:", { body, user: req.user });
      const data = insertFeedbackSchema.parse(body);
      const studentId = req.user?.id || (req.user as any)?._id || (req.user as any)?.userId;
      if (!studentId) {
        console.error("Missing studentId on authenticated request user object:", req.user);
        return res.status(401).json({ error: "User context missing. Please log in again." });
      }

      // Simple abuse-word filter on comment
      if (data.comment) {
        const lower = data.comment.toLowerCase();
        const hasAbuse = ABUSIVE_WORDS.some((w) => lower.includes(w));
        if (hasAbuse) {
          return res.status(400).json({ error: "Please remove inappropriate language from your feedback before submitting." });
        }
      }
      
      const teacher = await storage.getTeacher(data.teacherId);
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      // Use canonical teacher id (prefer id/_id from DB)
      const teacherId = (teacher as any).id || (teacher as any)._id || data.teacherId;

      // Check for duplicate feedback
      const hasExisting = await storage.hasFeedback(teacherId, studentId);
      if (hasExisting) {
        return res.status(400).json({ error: "You have already submitted feedback for this teacher" });
      }

      const anonymous = !!((body as any).isAnonymous ?? (body as any).anonymous);

      const feedbackData: Parameters<typeof storage.createFeedback>[0] = {
        teacherId,
        rating: data.rating,
        comment: data.comment || undefined,
        studentId,
        studentName: anonymous ? "Anonymous Student" : req.user!.name,
        isAnonymous: anonymous,
        subject: teacher.subject,
      };
      
      const newFeedback = await storage.createFeedback(feedbackData);

      if (body.doubt) {
        await storage.createDoubt({
          teacherId,
          studentId,
          studentName: anonymous ? "Anonymous Student" : req.user!.name,
          question: body.doubt,
        });
      }

      res.status(201).json(newFeedback);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Zod validation error:", JSON.stringify(error.errors, null, 2));
        console.error("Request body:", req.body);
        return res.status(400).json({ error: error.errors[0].message, details: error.errors });
      }
      console.error("Create feedback error:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      res.status(500).json({ error: "Failed to submit feedback", message: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Public QR feedback submission (no auth)
  app.post("/api/qr-feedback/:teacherId", async (req: Request, res: Response) => {
    try {
      const { teacherId } = req.params;
      const { rating, comment } = req.body as { rating?: number; comment?: string };

      if (typeof rating !== "number" || rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Rating must be a number between 1 and 5" });
      }

      const safeComment = typeof comment === "string" && comment.trim() ? comment.trim() : undefined;

      if (safeComment) {
        const lower = safeComment.toLowerCase();
        const hasAbuse = ABUSIVE_WORDS.some((w) => lower.includes(w));
        if (hasAbuse) {
          return res.status(400).json({ error: "Please remove inappropriate language from your feedback before submitting." });
        }
      }

      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      // Ensure there is a special "QR" user to associate anonymous QR feedback with
      const qrEmail = "qr-feedback@internal.local";
      let qrUser = await storage.getUserByEmail(qrEmail);
      if (!qrUser) {
        qrUser = await storage.createUser({
          name: "QR Feedback Student",
          email: qrEmail,
          password: "qr-feedback-temp-password",
          username: qrEmail.split("@")[0],
          role: "student",
          department: "QR",
        });
      }

      const feedbackData: Parameters<typeof storage.createFeedback>[0] = {
        teacherId,
        studentId: qrUser.id,
        studentName: "QR Student",
        rating,
        comment: safeComment,
        subject: teacher.subject,
      };

      const newFeedback = await storage.createFeedback(feedbackData);
      res.status(201).json(newFeedback);
    } catch (error) {
      console.error("QR feedback error:", error);
      res.status(500).json({ error: "Failed to submit QR feedback" });
    }
  });

  // Get feedback received by the current teacher, with quality insights
  app.get("/api/feedback/received", authenticateToken, requireRole("teacher"), async (req: AuthRequest, res) => {
    try {
      // Only return feedback for the logged-in teacher. If we can't find a matching
      // teacher profile, return an empty list instead of exposing all feedback.
      const teacherRow =
        (await storage.getTeacher(req.user!.id)) ||
        (await storage.getTeacherByName(req.user!.name)) ||
        (await storage.getTeacherByLooseName(req.user!.name));
      if (!teacherRow) {
        return res.json({ items: [], total: 0, page: 1, limit: 20 });
      }

      const page = parsePositiveInt(req.query.page, 1);
      const limit = Math.min(100, parsePositiveInt(req.query.limit, 20));
      const minRating = typeof req.query.minRating === "string" ? parseFloat(req.query.minRating) : 0;
      const subject = typeof req.query.subject === "string" ? req.query.subject.trim() : "";
      const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy : "recent";
      const searchQuery = typeof req.query.search === "string" ? req.query.search.trim() : "";

      const query: any = { teacherId: teacherRow.id };

      if (minRating > 0) {
        query.rating = { $gte: minRating };
      }

      if (subject) {
        const safeSub = escapeRegex(subject);
        query.subject = { $regex: safeSub, $options: "i" };
      }

      if (searchQuery) {
        const safeQuery = escapeRegex(searchQuery);
        query.$or = [
          { comment: { $regex: safeQuery, $options: "i" } },
          { studentName: { $regex: safeQuery, $options: "i" } },
          { subject: { $regex: safeQuery, $options: "i" } },
        ];
      }

      const sortOptions: any = {};
      switch (sortBy) {
        case "oldest": sortOptions.createdAt = 1; break;
        case "rating-high": sortOptions.rating = -1; break;
        case "rating-low": sortOptions.rating = 1; break;
        case "recent": default: sortOptions.createdAt = -1; break;
      }

      const skip = (page - 1) * limit;

      const [feedbackList, total] = await Promise.all([
        FeedbackModel.find(query).sort(sortOptions).skip(skip).limit(limit).lean(),
        FeedbackModel.countDocuments(query),
      ]);

      const withInsights = feedbackList.map((item) => {
        const commentLen = (item.comment || "").length;
        const qualityScore = Math.min(5, Math.max(1, Math.round((commentLen / 50) + item.rating / 2)));
        const hasComment = commentLen > 0;
        const anyItem = item as any;
        return { 
          ...item, 
          id: (anyItem.id ?? anyItem._id)?.toString?.() ?? (anyItem.id ?? anyItem._id),
          qualityScore, 
          commentLength: commentLen, 
          hasComment 
        };
      });

      res.json({
        items: withInsights,
        total,
        page,
        limit
      });
    } catch (error) {
      console.error("Get received feedback error:", error);
      res.status(500).json({ error: "Failed to get received feedback" });
    }
  });

  // Get feedback for a specific teacher (public route)
  app.get("/api/feedback/teacher/:teacherId", async (req, res) => {
    try {
      const { teacherId } = req.params;
      const feedbackList = await storage.getFeedbackByTeacher(teacherId);
      res.json(feedbackList);
    } catch (error) {
      console.error("Get teacher feedback error:", error);
      res.status(500).json({ error: "Failed to get teacher feedback" });
    }
  });

  // Reply Routes
  app.get("/api/feedback/:feedbackId/replies", async (req, res) => {
    try {
      const replies = await storage.getRepliesByFeedback(req.params.feedbackId);
      res.json(replies);
    } catch (error) {
      console.error("Get replies error:", error);
      res.status(500).json({ error: "Failed to get replies" });
    }
  });

  app.post("/api/feedback/:feedbackId/replies", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const data = insertReplySchema.parse({
        ...req.body,
        feedbackId: req.params.feedbackId,
        userId: req.user!.id,
        userName: req.user!.name,
        userRole: req.user!.role,
      });
      
      const reply = await storage.createReply(data);
      res.status(201).json(reply);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Create reply error:", error);
      res.status(500).json({ error: "Failed to create reply" });
    }
  });

  app.delete("/api/replies/:replyId", authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.deleteReply(req.params.replyId, req.user!.id);
      res.json({ message: "Reply deleted successfully" });
    } catch (error) {
      console.error("Delete reply error:", error);
      res.status(500).json({ error: "Failed to delete reply" });
    }
  });

  // Analytics Routes
  app.get("/api/analytics/teacher/:teacherId/trends", async (req, res) => {
    try {
      const { teacherId } = req.params;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const trends = await storage.getFeedbackTrends(teacherId, startDate, endDate);
      res.json(trends);
    } catch (error) {
      console.error("Get trends error:", error);
      res.status(500).json({ error: "Failed to get trends" });
    }
  });

  app.get("/api/analytics/departments/comparison", async (_req, res) => {
    try {
      const comparison = await storage.getDepartmentComparison();
      res.json(comparison);
    } catch (error) {
      console.error("Get department comparison error:", error);
      res.status(500).json({ error: "Failed to get department comparison" });
    }
  });

  // Leaderboard Routes
  app.get("/api/leaderboard/top-rated", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const topTeachers = await storage.getTopRatedTeachers(limit);
      res.json(topTeachers);
    } catch (error) {
      console.error("Get top rated teachers error:", error);
      res.status(500).json({ error: "Failed to get top rated teachers" });
    }
  });

  app.get("/api/leaderboard/most-feedback", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const topTeachers = await storage.getMostFeedbackTeachers(limit);
      res.json(topTeachers);
    } catch (error) {
      console.error("Get most feedback teachers error:", error);
      res.status(500).json({ error: "Failed to get most feedback teachers" });
    }
  });

  app.get("/api/leaderboard/most-improved", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const topTeachers = await storage.getMostImprovedTeachers(limit);
      res.json(topTeachers);
    } catch (error) {
      console.error("Get most improved teachers error:", error);
      res.status(500).json({ error: "Failed to get most improved teachers" });
    }
  });

  // Admin: Doubt SLA monitoring - overdue doubts
  app.get("/api/admin/doubts/overdue", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      const days = parseInt(req.query.days as string) || 5;
      const overdue = await storage.getOverdueDoubts(days);
      res.json(overdue);
    } catch (error) {
      console.error("Get overdue doubts error:", error);
      res.status(500).json({ error: "Failed to get overdue doubts" });
    }
  });

  // Admin: Feedback moderation queue (flagged for abusive language)
  app.get("/api/admin/feedback/flagged", authenticateToken, requireRole("admin"), async (_req: AuthRequest, res) => {
    try {
      const flagged = await storage.getFlaggedFeedback(ABUSIVE_WORDS);
      res.json(flagged);
    } catch (error) {
      console.error("Get flagged feedback error:", error);
      res.status(500).json({ error: "Failed to get flagged feedback" });
    }
  });

  // Admin: delete feedback (for moderation)
  app.delete("/api/admin/feedback/:id", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      const id = req.params.id;
      const existing = await storage.getFeedbackById(id);

      if (!existing) {
        return res.status(404).json({ error: "Feedback not found" });
      }

      await storage.deleteFeedback(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete feedback (admin) error:", error);
      res.status(500).json({ error: "Failed to delete feedback" });
    }
  });

  // Activity Feed Route
  app.get("/api/activity/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const activity = await storage.getRecentActivity(limit);
      res.json(activity);
    } catch (error) {
      console.error("Get recent activity error:", error);
      res.status(500).json({ error: "Failed to get recent activity" });
    }
  });

  app.get("/api/analytics/teacher/:teacherId/monthly", async (req, res) => {
    try {
      const { teacherId } = req.params;
      const monthly = await storage.getMonthlyPerformance(teacherId);
      res.json(monthly);
    } catch (error) {
      console.error("Get monthly performance error:", error);
      res.status(500).json({ error: "Failed to get monthly performance" });
    }
  });

  app.get("/api/analytics/teacher/:teacherId/improvement", async (req, res) => {
    try {
      const { teacherId } = req.params;
      const data = await storage.getTeacherImprovement(teacherId);

      if (!data) {
        return res.json({
          hasData: false,
          improvement: 0,
          recentAverage: null,
          previousAverage: null,
        });
      }

      res.json({
        hasData: true,
        improvement: data.improvement,
        recentAverage: data.recentAverage,
        previousAverage: data.previousAverage,
      });
    } catch (error) {
      console.error("Get teacher improvement error:", error);
      res.status(500).json({ error: "Failed to get teacher improvement" });
    }
  });

  // AI Routes
  
  // AI: Analyze feedback sentiment and quality
  app.post("/api/ai/analyze-feedback/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const feedbackId = req.params.id;
      const fb = await storage.getFeedbackById(feedbackId);

      if (!fb) {
        return res.status(404).json({ error: "Feedback not found" });
      }
      
      // Analyze sentiment
      const sentiment = await aiService.analyzeSentiment(fb.comment || "");
      
      // Score quality
      const quality = await aiService.scoreFeedbackQuality(fb.comment || "", fb.rating);

      // Save analysis
      await storage.saveFeedbackAnalysis({
        feedbackId: fb._id,
        sentiment: sentiment.sentiment,
        sentimentScore: sentiment.score,
        qualityScore: quality.score,
        keywords: JSON.stringify(sentiment.keywords),
      });

      res.json({
        sentiment: sentiment.sentiment,
        sentimentScore: sentiment.score,
        keywords: sentiment.keywords,
        qualityScore: quality.score,
        qualityReasoning: quality.reasoning,
      });
    } catch (error: any) {
      console.error("Analyze feedback error:", error);
      const status = typeof error?.status === "number" ? error.status : 500;
      res.status(status).json({ error: error?.message || "Failed to analyze feedback" });
    }
  });

  // AI: Generate teacher summary
  app.post("/api/ai/teacher-summary/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const teacherId = req.params.id;
      const feedbackList = await storage.getFeedbackByTeacher(teacherId);

      const summary = await aiService.generateFeedbackSummary(
        feedbackList.map((f) => ({
          rating: f.rating,
          comment: f.comment ?? null,
        }))
      );

      // Save summary
      await storage.saveTeacherSummary({
        teacherId,
        summary: summary.summary,
        strengths: JSON.stringify(summary.strengths),
        improvements: JSON.stringify(summary.improvements),
      });

      res.json(summary);
    } catch (error: any) {
      console.error("Generate summary error:", error);
      const status = typeof error?.status === "number" ? error.status : 500;
      res.status(status).json({ error: error?.message || "Failed to generate summary" });
    }
  });

  // AI: Get teacher summary
  app.get("/api/ai/teacher-summary/:id", async (req, res) => {
    try {
      const teacherId = req.params.id;
      const summary = await storage.getLatestTeacherSummary(teacherId);

      if (!summary) {
        return res.status(404).json({ error: "No summary available" });
      }

      res.json({
        summary: summary.summary,
        strengths: JSON.parse(summary.strengths || "[]"),
        improvements: JSON.parse(summary.improvements || "[]"),
        generatedAt: summary.generatedAt,
      });
    } catch (error: any) {
      console.error("Get summary error:", error);
      res.status(500).json({ error: error.message || "Failed to get summary" });
    }
  });

  // AI: Teacher recommendations
  app.post("/api/ai/recommend-teachers", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { preferences } = req.body;
      
      if (!preferences || typeof preferences !== "string") {
        return res.status(400).json({ error: "Preferences string required" });
      }

      const teachers = await storage.getTeachers();
      const recommendations = await aiService.recommendTeachers(
        preferences,
        teachers.map((t) => ({
          id: (t as any).id,
          name: t.name,
          department: t.department,
          subject: t.subject,
          averageRating: t.averageRating ?? null,
          bio: t.bio ?? null,
        }))
      );

      res.json({ recommendations });
    } catch (error: any) {
      console.error("Recommend teachers error:", error);
      const status = typeof error?.status === "number" ? error.status : 500;
      res.status(status).json({ error: error?.message || "Failed to get recommendations" });
    }
  });

  // AI: Improve student feedback text
  app.post("/api/ai/improve-feedback", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
    try {
      const { comment } = req.body as { comment?: string };

      if (!comment || typeof comment !== "string" || !comment.trim()) {
        return res.status(400).json({ error: "Comment is required" });
      }

      const improvedComment = await aiService.improveFeedback(comment);
      res.json({ improvedComment });
    } catch (error: any) {
      console.error("Improve feedback error:", error);
      const status = typeof error?.status === "number" ? error.status : 500;
      res.status(status).json({ error: error?.message || "Failed to improve feedback" });
    }
  });

  // AI: Chatbot
  app.post("/api/ai/chat", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { message, history } = req.body as {
        message?: string;
        history?: Array<{ role: string; content: string }>;
      };

      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }

      const response = await aiService.chatbot(message.trim(), Array.isArray(history) ? history : []);
      res.json({ response });
    } catch (error: any) {
      console.error("Chatbot error:", error);
      const status = typeof error?.status === "number" ? error.status : 500;
      res.status(status).json({ error: error?.message || "Failed to process chat message" });
    }
  });

  // AI: Reply templates for teachers
  app.post("/api/ai/reply-templates", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { comment } = req.body as { comment?: string };

      if (!comment || typeof comment !== "string" || !comment.trim()) {
        return res.status(400).json({ error: "Comment is required" });
      }

      // Optional: restrict to teacher/admin roles
      if (req.user && !["teacher", "admin"].includes(req.user.role)) {
        return res.status(403).json({ error: "Only teachers and admins can use reply templates" });
      }

      const templates = await aiService.generateReplyTemplates(comment);
      res.json({ templates });
    } catch (error: any) {
      console.error("Reply templates error:", error);
      const status = typeof error?.status === "number" ? error.status : 500;
      res.status(status).json({ error: error?.message || "Failed to generate reply templates" });
    }
  });

  // AI: Get feedback analysis
  app.get("/api/ai/feedback-analysis/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const feedbackId = req.params.id;
      const analysis = await storage.getFeedbackAnalysis(feedbackId);

      if (!analysis) {
        return res.status(404).json({ error: "No analysis available" });
      }

      res.json({
        sentiment: analysis.sentiment,
        sentimentScore: analysis.sentimentScore,
        qualityScore: analysis.qualityScore,
        keywords: JSON.parse(analysis.keywords || "[]"),
        analyzedAt: analysis.analyzedAt,
      });
    } catch (error: any) {
      console.error("Get feedback analysis error:", error);
      const status = typeof error?.status === "number" ? error.status : 500;
      res.status(status).json({ error: error?.message || "Failed to get analysis" });
    }
  });

  // ─── NEW 2026 AI ROUTES ──────────────────────────────────────────────

  // AI: Auto-answer a student doubt instantly
  app.post("/api/ai/auto-answer-doubt", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { question, teacherId } = req.body as { question?: string; teacherId?: string };

      if (!question || typeof question !== "string" || !question.trim()) {
        return res.status(400).json({ error: "Question is required" });
      }

      if (!teacherId) {
        return res.status(400).json({ error: "Teacher ID is required" });
      }

      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      const answer = await aiService.autoAnswerDoubt(
        question.trim(),
        teacher.subject,
        teacher.name
      );

      res.json({ answer, isAiGenerated: true });
    } catch (error: any) {
      console.error("Auto answer doubt error:", error);
      const status = typeof error?.status === "number" ? error.status : 500;
      res.status(status).json({ error: error?.message || "Failed to generate auto answer" });
    }
  });

  // AI: Categorize feedback into themes
  app.post("/api/ai/categorize-feedback/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const feedbackId = req.params.id;
      const fb = await storage.getFeedbackById(feedbackId);

      if (!fb) {
        return res.status(404).json({ error: "Feedback not found" });
      }

      const result = await aiService.categorizeFeedback(fb.comment || "");

      // Save to database
      await storage.saveFeedbackCategory(fb._id, {
        categories: result.categories,
        primaryCategory: result.primaryCategory,
        confidence: result.confidence,
      });

      res.json(result);
    } catch (error: any) {
      console.error("Categorize feedback error:", error);
      const status = typeof error?.status === "number" ? error.status : 500;
      res.status(status).json({ error: error?.message || "Failed to categorize feedback" });
    }
  });

  // AI: Get feedback category
  app.get("/api/ai/feedback-category/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const feedbackId = req.params.id;
      const category = await storage.getFeedbackCategory(feedbackId);

      if (!category) {
        return res.status(404).json({ error: "No category data available" });
      }

      res.json({
        categories: JSON.parse(category.categories || "[]"),
        primaryCategory: category.primaryCategory,
        confidence: category.confidence,
        categorizedAt: category.categorizedAt,
      });
    } catch (error: any) {
      console.error("Get feedback category error:", error);
      res.status(500).json({ error: error?.message || "Failed to get category" });
    }
  });

  // AI: Generate action items for a teacher
  app.post("/api/ai/action-items/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { teacherId } = req.params;

      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      const feedbackList = await storage.getFeedbackByTeacher(teacherId);
      const items = await aiService.generateActionItems(
        feedbackList.map((f) => ({
          rating: f.rating,
          comment: f.comment ?? null,
        })),
        teacher.name
      );

      // Save action items
      if (items.length > 0) {
        await storage.saveActionItems(teacherId, items);
      }

      res.json({ items });
    } catch (error: any) {
      console.error("Generate action items error:", error);
      const status = typeof error?.status === "number" ? error.status : 500;
      res.status(status).json({ error: error?.message || "Failed to generate action items" });
    }
  });

  // AI: Get stored action items for a teacher
  app.get("/api/ai/action-items/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { teacherId } = req.params;
      const items = await storage.getActionItems(teacherId);
      res.json({
        items: items.map((item) => ({
          id: item.id,
          action: item.action,
          priority: item.priority,
          category: item.category,
          basedOn: item.basedOn,
          status: item.status,
          generatedAt: item.generatedAt,
        })),
      });
    } catch (error: any) {
      console.error("Get action items error:", error);
      res.status(500).json({ error: error?.message || "Failed to get action items" });
    }
  });

  // AI: Update action item status
  app.patch("/api/ai/action-items/:itemId/status", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { itemId } = req.params;
      const { status } = req.body as { status?: string };

      if (!status || !["pending", "in-progress", "completed", "dismissed"].includes(status)) {
        return res.status(400).json({ error: "Valid status is required (pending, in-progress, completed, dismissed)" });
      }

      const updated = await storage.updateActionItemStatus(itemId, status);
      if (!updated) {
        return res.status(404).json({ error: "Action item not found" });
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Update action item status error:", error);
      res.status(500).json({ error: error?.message || "Failed to update status" });
    }
  });

  // AI: Generate weekly digest for a teacher
  app.post("/api/ai/weekly-digest/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { teacherId } = req.params;

      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      // Get recent feedback (last 7 days)
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const allFeedback = await storage.getFeedbackByTeacher(teacherId);
      const recentFeedback = allFeedback.filter((f) => {
        const createdAt = f.createdAt ? new Date(f.createdAt) : null;
        return createdAt && createdAt >= weekAgo;
      });

      // Calculate stats
      const totalFeedback = recentFeedback.length;
      const avgRating = totalFeedback > 0
        ? recentFeedback.reduce((s, f) => s + f.rating, 0) / totalFeedback
        : teacher.averageRating || 0;

      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const prevWeekFeedback = allFeedback.filter((f) => {
        const createdAt = f.createdAt ? new Date(f.createdAt) : null;
        return createdAt && createdAt >= twoWeeksAgo && createdAt < weekAgo;
      });
      const prevAvg = prevWeekFeedback.length > 0
        ? prevWeekFeedback.reduce((s, f) => s + f.rating, 0) / prevWeekFeedback.length
        : avgRating;

      const digest = await aiService.generateWeeklyDigest(
        teacher.name,
        recentFeedback.map((f) => ({
          rating: f.rating,
          comment: f.comment ?? null,
          createdAt: f.createdAt ?? null,
        })),
        {
          totalFeedback,
          averageRating: avgRating,
          previousAvgRating: prevAvg,
        }
      );

      // Save digest
      await storage.saveWeeklyDigest(teacherId, digest);

      res.json(digest);
    } catch (error: any) {
      console.error("Generate weekly digest error:", error);
      const status = typeof error?.status === "number" ? error.status : 500;
      res.status(status).json({ error: error?.message || "Failed to generate weekly digest" });
    }
  });

  // AI: Get stored weekly digest for a teacher
  app.get("/api/ai/weekly-digest/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { teacherId } = req.params;
      const digest = await storage.getLatestWeeklyDigest(teacherId);

      if (!digest) {
        return res.status(404).json({ error: "No weekly digest available" });
      }

      res.json({
        headline: digest.headline,
        ratingTrend: digest.ratingTrend,
        topStrengths: JSON.parse(digest.topStrengths || "[]"),
        focusAreas: JSON.parse(digest.focusAreas || "[]"),
        studentEngagement: digest.studentEngagement,
        motivationalNote: digest.motivationalNote,
        weekSummary: digest.weekSummary,
        weekStartDate: digest.weekStartDate,
        generatedAt: digest.generatedAt,
      });
    } catch (error: any) {
      console.error("Get weekly digest error:", error);
      res.status(500).json({ error: error?.message || "Failed to get weekly digest" });
    }
  });

  // AI: Detect toxic content in feedback or comments
  app.post("/api/ai/detect-toxic", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { text } = req.body as { text?: string };

      if (!text || typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "Text is required" });
      }

      const result = await aiService.detectToxicContent(text.trim());
      res.json(result);
    } catch (error: any) {
      console.error("Detect toxic content error:", error);
      const status = typeof error?.status === "number" ? error.status : 500;
      res.status(status).json({ error: error?.message || "Failed to detect toxic content" });
    }
  });

  // AI: Predict rating trend for a teacher
  app.get("/api/ai/predict-trend/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { teacherId } = req.params;

      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      const monthlyPerformance = await storage.getMonthlyPerformance(teacherId);
      const prediction = await aiService.predictRatingTrend(
        monthlyPerformance.map((m) => ({
          month: m.month,
          avgRating: m.avgRating,
          count: m.count,
        })),
        teacher.name
      );

      res.json(prediction);
    } catch (error: any) {
      console.error("Predict trend error:", error);
      const status = typeof error?.status === "number" ? error.status : 500;
      res.status(status).json({ error: error?.message || "Failed to predict trend" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // ClassIntel AI Intelligence Routes (Python AI Service integration)
  // ──────────────────────────────────────────────────────────────────────

  /** Helper: call Python AI service */
  async function callAIService(path: string, body: any): Promise<any> {
    const res = await fetch(`${AI_SERVICE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`AI Service error (${res.status}): ${detail}`);
    }
    return res.json();
  }

  // Full analysis (sentiment + topics) for a single feedback
  app.post("/api/intelligence/analyze", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { feedback } = req.body as { feedback?: string };
      if (!feedback?.trim()) return res.status(400).json({ error: "Feedback text is required" });
      const result = await callAIService("/analyze", { feedback: feedback.trim() });
      res.json(result);
    } catch (error: any) {
      console.error("Intelligence analyze error:", error);
      res.status(500).json({ error: error?.message || "Analysis failed" });
    }
  });

  // Sentiment analysis for all feedback of a teacher
  app.get("/api/intelligence/sentiment/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { teacherId } = req.params;
      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) return res.status(404).json({ error: "Teacher not found" });

      const feedbacks = await storage.getFeedbackByTeacher(teacherId);
      const texts = feedbacks.map((f: any) => f.comment || "").filter((c: string) => c.trim());

      if (texts.length === 0) {
        return res.json({
          aggregate: { total: 0, positive: 0, negative: 0, neutral: 0, positivePercent: 0, negativePercent: 0, neutralPercent: 0, avgPolarity: 0 },
          results: [],
        });
      }

      const result = await callAIService("/sentiment/batch", { feedbacks: texts });

      // Save snapshot
      const snapshot = new SentimentSnapshotModel({
        teacherId,
        ...result.aggregate,
        totalAnalyzed: result.aggregate.total,
      });
      await snapshot.save().catch(() => {});

      // Check for negative spike alert
      if (result.aggregate.negativePercent > 50) {
        const existingAlert = await AlertModel.findOne({
          teacherId,
          type: "negative_spike",
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        });
        if (!existingAlert) {
          await new AlertModel({
            teacherId,
            type: "negative_spike",
            severity: result.aggregate.negativePercent > 70 ? "critical" : "warning",
            title: "Negative Feedback Spike Detected",
            message: `${result.aggregate.negativePercent}% of recent feedback is negative. Review student concerns.`,
            data: JSON.stringify({ negativePercent: result.aggregate.negativePercent }),
          }).save().catch(() => {});
        }
      }

      res.json(result);
    } catch (error: any) {
      console.error("Sentiment analysis error:", error);
      res.status(500).json({ error: error?.message || "Sentiment analysis failed" });
    }
  });

  // Topic extraction for a teacher's feedback
  app.get("/api/intelligence/topics/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { teacherId } = req.params;
      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) return res.status(404).json({ error: "Teacher not found" });

      const feedbacks = await storage.getFeedbackByTeacher(teacherId);
      const texts = feedbacks.map((f: any) => f.comment || "").filter((c: string) => c.trim());

      if (texts.length === 0) {
        return res.json({ frequency: [], weakAreas: [], totalFeedback: 0, topicsDetected: 0 });
      }

      const result = await callAIService("/topics/batch", { feedbacks: texts });

      // Save topic analysis
      await TopicAnalysisModel.findOneAndUpdate(
        { teacherId },
        {
          teacherId,
          frequency: JSON.stringify(result.frequency),
          weakAreas: JSON.stringify(result.weakAreas),
          totalFeedback: result.totalFeedback,
          topicsDetected: result.topicsDetected,
          analyzedAt: new Date(),
        },
        { upsert: true, new: true },
      ).catch(() => {});

      res.json(result);
    } catch (error: any) {
      console.error("Topic extraction error:", error);
      res.status(500).json({ error: error?.message || "Topic extraction failed" });
    }
  });

  // Student risk prediction for a teacher's class
  app.post("/api/intelligence/risk/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { teacherId } = req.params;
      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) return res.status(404).json({ error: "Teacher not found" });

      const { students } = req.body as { students?: any[] };
      if (!students || !Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ error: "Students data is required" });
      }

      const result = await callAIService("/risk/class", { students });

      // Save risk predictions
      for (const sr of result.students) {
        await StudentRiskModel.findOneAndUpdate(
          { teacherId, studentName: sr.studentName },
          {
            teacherId,
            studentId: sr.studentId || undefined,
            studentName: sr.studentName,
            riskLevel: sr.riskLevel,
            riskScore: sr.riskScore,
            attendance: sr.components?.attendance?.value || 75,
            marks: sr.components?.marks?.value || 50,
            sentimentPolarity: 0,
            engagementScore: sr.components?.engagement?.value || 50,
            factors: JSON.stringify(sr.factors || []),
            recommendations: JSON.stringify(sr.recommendations || []),
            predictedAt: new Date(),
          },
          { upsert: true, new: true },
        ).catch(() => {});
      }

      // Alert on high-risk students
      if (result.summary.highRisk > 0) {
        await new AlertModel({
          teacherId,
          type: "risk_alert",
          severity: result.summary.highRiskPercent > 30 ? "critical" : "warning",
          title: `${result.summary.highRisk} High-Risk Student(s) Detected`,
          message: `${result.summary.highRiskPercent}% of students are at high risk. Immediate intervention recommended.`,
          data: JSON.stringify({ highRisk: result.summary.highRisk, total: result.summary.total }),
        }).save().catch(() => {});
      }

      res.json(result);
    } catch (error: any) {
      console.error("Risk prediction error:", error);
      res.status(500).json({ error: error?.message || "Risk prediction failed" });
    }
  });

  // Get saved risk data for a teacher
  app.get("/api/intelligence/risk/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { teacherId } = req.params;
      const risks = await StudentRiskModel.find({ teacherId }).sort({ riskScore: -1 }).lean();
      const parsed = risks.map((r: any) => ({
        ...r,
        id: r._id,
        factors: JSON.parse(r.factors || "[]"),
        recommendations: JSON.parse(r.recommendations || "[]"),
      }));

      const total = parsed.length;
      const highRisk = parsed.filter((r: any) => r.riskLevel === "high").length;
      const mediumRisk = parsed.filter((r: any) => r.riskLevel === "medium").length;
      const lowRisk = parsed.filter((r: any) => r.riskLevel === "low").length;

      res.json({
        students: parsed,
        summary: {
          total, highRisk, mediumRisk, lowRisk,
          highRiskPercent: total ? Math.round(highRisk / total * 100) : 0,
          mediumRiskPercent: total ? Math.round(mediumRisk / total * 100) : 0,
          lowRiskPercent: total ? Math.round(lowRisk / total * 100) : 0,
        },
      });
    } catch (error: any) {
      console.error("Get risk data error:", error);
      res.status(500).json({ error: error?.message || "Failed to get risk data" });
    }
  });

  // AI Suggestions for a teacher
  app.get("/api/intelligence/suggestions/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { teacherId } = req.params;
      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) return res.status(404).json({ error: "Teacher not found" });

      const feedbacks = await storage.getFeedbackByTeacher(teacherId);
      const texts = feedbacks.map((f: any) => f.comment || "").filter((c: string) => c.trim());

      if (texts.length === 0) {
        return res.json({ suggestions: [], summary: "No feedback available yet.", sentimentOverview: {}, topicAnalysis: [] });
      }

      const result = await callAIService("/suggestions", {
        feedbacks: texts,
        teacherName: teacher.name,
        subject: teacher.subject,
      });

      // Save suggestions
      await AISuggestionModel.findOneAndUpdate(
        { teacherId },
        {
          teacherId,
          suggestions: JSON.stringify(result.suggestions),
          sentimentOverview: JSON.stringify(result.sentimentOverview),
          topicAnalysis: JSON.stringify(result.topicAnalysis),
          summary: result.summary,
          generatedAt: new Date(),
        },
        { upsert: true, new: true },
      ).catch(() => {});

      res.json(result);
    } catch (error: any) {
      console.error("Suggestions error:", error);
      res.status(500).json({ error: error?.message || "Failed to generate suggestions" });
    }
  });

  // Get alerts for a teacher
  app.get("/api/intelligence/alerts/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { teacherId } = req.params;
      const alerts = await AlertModel.find({ teacherId }).sort({ createdAt: -1 }).limit(20).lean();
      const parsed = alerts.map((a: any) => ({
        ...a,
        id: a._id,
        data: JSON.parse(a.data || "{}"),
      }));
      res.json(parsed);
    } catch (error: any) {
      console.error("Get alerts error:", error);
      res.status(500).json({ error: error?.message || "Failed to get alerts" });
    }
  });

  // Mark alert as read
  app.patch("/api/intelligence/alerts/:alertId/read", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const updated = await AlertModel.findByIdAndUpdate(req.params.alertId, { isRead: true }, { new: true });
      if (!updated) return res.status(404).json({ error: "Alert not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update alert" });
    }
  });

  // Sentiment history (trend data)
  app.get("/api/intelligence/sentiment-history/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { teacherId } = req.params;
      const snapshots = await SentimentSnapshotModel.find({ teacherId })
        .sort({ snapshotAt: -1 })
        .limit(30)
        .lean();
      res.json(snapshots.reverse());
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get sentiment history" });
    }
  });

  // AI Service health check
  app.get("/api/intelligence/health", async (_req, res) => {
    try {
      const aiRes = await fetch(`${AI_SERVICE_URL}/health`);
      const data = await aiRes.json();
      res.json({ ...data, backendConnected: true });
    } catch {
      res.json({ status: "unavailable", backendConnected: false, message: "Python AI service is not running. Start it with: cd ai-service && python app.py" });
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // MODULE 1: Face Recognition Attendance
  // ════════════════════════════════════════════════════════════════════

  // Register face descriptor
  app.post("/api/attendance/register-face", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { faceDescriptor } = req.body as { faceDescriptor?: number[] };
      if (!faceDescriptor || !Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
        return res.status(400).json({ error: "Valid face descriptor (128 floats) is required" });
      }
      await FaceRegistrationModel.findOneAndUpdate(
        { userId: req.user!.id },
        { userId: req.user!.id, faceDescriptor: JSON.stringify(faceDescriptor), registeredAt: new Date() },
        { upsert: true, new: true },
      );
      res.json({ success: true, message: "Face registered successfully" });
    } catch (error) {
      console.error("Face registration error:", error);
      res.status(500).json({ error: "Failed to register face" });
    }
  });

  // Check if face is registered
  app.get("/api/attendance/face-status", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const reg = await FaceRegistrationModel.findOne({ userId: req.user!.id }).lean();
      res.json({ registered: !!reg, registeredAt: reg?.registeredAt });
    } catch (error) {
      res.status(500).json({ error: "Failed to check face status" });
    }
  });

  // Get all registered face descriptors (for teacher to verify attendance)
  app.get("/api/attendance/face-descriptors", authenticateToken, requireRole("teacher", "admin"), async (_req: AuthRequest, res) => {
    try {
      const regs = await FaceRegistrationModel.find({}).lean();
      const users = await UserModel.find({ _id: { $in: regs.map((r: any) => r.userId) } }).lean();
      const userMap = new Map(users.map((u: any) => [u._id.toString(), u]));
      const result = regs.map((r: any) => {
        let descriptor = [];
        try {
          descriptor = typeof r.faceDescriptor === "string" ? JSON.parse(r.faceDescriptor) : r.faceDescriptor;
        } catch (e) {
          console.warn("[FaceService] Failed to parse descriptor for user:", r.userId);
        }
        return {
          userId: r.userId,
          userName: userMap.get(r.userId)?.name || "Unknown",
          faceDescriptor: descriptor,
        };
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to get face descriptors" });
    }
  });

  // Helper: get teacher identifier (teacher profile ID or fallback to user ID)
  async function getTeacherId(user: { id: string; name: string }): Promise<string> {
    const teacherRow =
      (await storage.getTeacher(user.id)) ||
      (await storage.getTeacherByName(user.name)) ||
      (await storage.getTeacherByLooseName(user.name));
    return teacherRow?.id || user.id;
  }

  // Create attendance session
  app.post("/api/attendance/sessions", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
    try {
      const teacherId = await getTeacherId(req.user!);
      const { subject } = req.body as { subject?: string };
      if (!subject?.trim()) {
        return res.status(400).json({ error: "Subject is required" });
      }
      const session = await AttendanceSessionModel.create({
        teacherId,
        subject: subject.trim(),
        date: new Date(),
        startTime: new Date(),
        status: "active",
      });
      res.status(201).json({ ...session.toObject(), id: session._id });
    } catch (error) {
      console.error("Create session error:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  // Close attendance session
  app.patch("/api/attendance/sessions/:sessionId/close", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
    try {
      const session = await AttendanceSessionModel.findByIdAndUpdate(
        req.params.sessionId,
        { status: "closed", endTime: new Date() },
        { new: true },
      );
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json({ ...session.toObject(), id: session._id });
    } catch (error) {
      res.status(500).json({ error: "Failed to close session" });
    }
  });

  // List attendance sessions for teacher
  app.get("/api/attendance/sessions", authenticateToken, async (req: AuthRequest, res) => {
    try {
      let teacherId: string | undefined;
      if (req.user!.role === "teacher") {
        teacherId = await getTeacherId(req.user!);
      } else if (req.query.teacherId) {
        teacherId = req.query.teacherId as string;
      }
      const query = teacherId ? { teacherId } : {};
      const sessions = await AttendanceSessionModel.find(query).sort({ date: -1 }).limit(50).lean();
      res.json(sessions.map((s: any) => ({ ...s, id: s._id })));
    } catch (error) {
      res.status(500).json({ error: "Failed to get sessions" });
    }
  });

  // Mark attendance (face-based or manual)
  app.post("/api/attendance/mark", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { sessionId, method, confidence } = req.body as {
        sessionId: string;
        method?: string;
        confidence?: number;
      };
      if (!sessionId) return res.status(400).json({ error: "sessionId is required" });

      const session = await AttendanceSessionModel.findById(sessionId).lean();
      if (!session) return res.status(404).json({ error: "Session not found" });
      if ((session as any).status === "closed") return res.status(400).json({ error: "Session is closed" });

      // Check for proxy: same face descriptor used by different user  
      const existing = await AttendanceRecordModel.findOne({ sessionId, studentId: req.user!.id }).lean();
      if (existing) return res.status(400).json({ error: "Attendance already marked" });

      const record = await AttendanceRecordModel.create({
        sessionId,
        studentId: req.user!.id,
        studentName: req.user!.name,
        method: method || "face",
        confidence: confidence || 0,
        markedAt: new Date(),
      });
      res.status(201).json({ ...record.toObject(), id: record._id });
    } catch (error: any) {
      if (error?.code === 11000) return res.status(400).json({ error: "Attendance already marked" });
      console.error("Mark attendance error:", error);
      res.status(500).json({ error: "Failed to mark attendance" });
    }
  });

  // Get attendance records for a session
  app.get("/api/attendance/sessions/:sessionId/records", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const records = await AttendanceRecordModel.find({ sessionId: req.params.sessionId }).sort({ markedAt: 1 }).lean();
      res.json(records.map((r: any) => ({ ...r, id: r._id })));
    } catch (error) {
      res.status(500).json({ error: "Failed to get records" });
    }
  });

  // Get student's attendance summary
  app.get("/api/attendance/my-summary", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
    try {
      const records = await AttendanceRecordModel.find({ studentId: req.user!.id }).lean();
      const attendedSessionIds = [...new Set(records.map((r: any) => r.sessionId))];
      const attended = attendedSessionIds.length;

      // Count only closed sessions that this student could have attended
      // (sessions that existed during the student's enrollment period)
      // Use the student's first attendance record date as a lower bound, or count all if no records
      let totalQuery: any = { status: "closed" };
      if (attendedSessionIds.length > 0) {
        // Get the earliest session the student attended to scope the total
        const earliestRecord = records.reduce((min: any, r: any) =>
          new Date(r.markedAt) < new Date(min.markedAt) ? r : min
        , records[0]);
        const earliestSession = await AttendanceSessionModel.findById(earliestRecord.sessionId).lean();
        if (earliestSession) {
          totalQuery.date = { $gte: (earliestSession as any).date };
        }
      }
      const totalSessions = await AttendanceSessionModel.countDocuments(totalQuery);

      // Also include currently active sessions in the total for a more accurate picture
      const activeSessions = await AttendanceSessionModel.countDocuments({ status: "active" });
      const total = totalSessions + activeSessions;

      const percentage = total > 0 ? Math.round((attended / total) * 100) : 100;
      res.json({ attended, total, percentage, records: records.map((r: any) => ({ ...r, id: r._id })) });
    } catch (error) {
      console.error("Attendance summary error:", error);
      res.status(500).json({ error: "Failed to get attendance summary" });
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // MODULE 2: AI Lecture Summarizer
  // ════════════════════════════════════════════════════════════════════

  // Save lecture transcript and generate summary
  app.post("/api/lectures/summarize", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
    try {
      const teacherId = await getTeacherId(req.user!);

      const { title, subject, transcript, duration } = req.body as {
        title?: string; subject?: string; transcript?: string; duration?: number;
      };
      if (!title?.trim() || !transcript?.trim()) {
        return res.status(400).json({ error: "Title and transcript are required" });
      }

      // Generate summary using AI
      let summary = "";
      let keyTopics: string[] = [];
      let flashcards: Array<{ question: string; answer: string }> = [];

      try {
        const summaryPrompt = `Summarize this lecture transcript in 3-5 concise paragraphs. Focus on key concepts:\n\n${transcript.substring(0, 3000)}`;
        summary = await aiService.generateText(summaryPrompt);
      } catch {
        summary = "AI summary could not be generated. Transcript saved for manual review.";
      }

      try {
        const topicsPrompt = `Extract the top 5 key topics from this lecture as a JSON array of strings:\n\n${transcript.substring(0, 2000)}`;
        const topicsRaw = await aiService.generateText(topicsPrompt);
        const jsonMatch = topicsRaw.match(/\[[\s\S]*?\]/);
        if (jsonMatch) keyTopics = JSON.parse(jsonMatch[0]);
      } catch {
        keyTopics = ["General Topic"];
      }

      try {
        const flashcardsPrompt = `Generate 5 flashcards from this lecture. Return as JSON array of {question, answer}:\n\n${transcript.substring(0, 2000)}`;
        const flashcardsRaw = await aiService.generateText(flashcardsPrompt);
        const jsonMatch = flashcardsRaw.match(/\[[\s\S]*?\]/);
        if (jsonMatch) flashcards = JSON.parse(jsonMatch[0]);
      } catch {
        flashcards = [{ question: "What was this lecture about?", answer: title || "Unknown topic" }];
      }

      const lecture = await LectureSummaryModel.create({
        teacherId,
        title: title.trim(),
        subject: subject?.trim() || "General",
        transcript,
        summary,
        keyTopics: JSON.stringify(keyTopics),
        flashcards: JSON.stringify(flashcards),
        duration: duration || 0,
      });

      res.status(201).json({
        ...lecture.toObject(),
        id: lecture._id,
        keyTopics,
        flashcards,
      });
    } catch (error) {
      console.error("Lecture summarize error:", error);
      res.status(500).json({ error: "Failed to summarize lecture" });
    }
  });

  // List lectures
  app.get("/api/lectures", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const query: any = {};
      if (req.query.teacherId) query.teacherId = req.query.teacherId;
      if (req.user!.role === "teacher") {
        query.teacherId = await getTeacherId(req.user!);
      }
      const lectures = await LectureSummaryModel.find(query).sort({ createdAt: -1 }).limit(50).lean();
      const parsed = lectures.map((l: any) => ({
        ...l,
        id: l._id,
        keyTopics: JSON.parse(l.keyTopics || "[]"),
        flashcards: JSON.parse(l.flashcards || "[]"),
      }));
      res.json(parsed);
    } catch (error) {
      res.status(500).json({ error: "Failed to get lectures" });
    }
  });

  // Get single lecture
  app.get("/api/lectures/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const lecture = await LectureSummaryModel.findById(req.params.id).lean();
      if (!lecture) return res.status(404).json({ error: "Lecture not found" });
      res.json({
        ...lecture,
        id: (lecture as any)._id,
        keyTopics: JSON.parse((lecture as any).keyTopics || "[]"),
        flashcards: JSON.parse((lecture as any).flashcards || "[]"),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get lecture" });
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // MODULE 3: Quiz + AI Cheating Detection
  // ════════════════════════════════════════════════════════════════════

  // Create a quiz (teacher only)
  app.post("/api/quizzes", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
    try {
      const teacherId = await getTeacherId(req.user!);

      const data = createQuizSchema.parse(req.body);
      const quiz = await QuizModel.create({
        teacherId,
        title: data.title,
        subject: data.subject,
        questions: JSON.stringify(data.questions),
        duration: data.duration,
        isActive: true,
      });
      res.status(201).json({ ...quiz.toObject(), id: quiz._id, questions: data.questions });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      console.error("Create quiz error:", error);
      res.status(500).json({ error: "Failed to create quiz" });
    }
  });

  // List quizzes
  app.get("/api/quizzes", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const query: any = {};
      if (req.query.teacherId) query.teacherId = req.query.teacherId;
      if (req.user!.role === "teacher") {
        query.teacherId = await getTeacherId(req.user!);
      }
      if (req.user!.role === "student") query.isActive = true;
      const quizzes = await QuizModel.find(query).sort({ createdAt: -1 }).lean();
      const result = quizzes.map((q: any) => {
        const parsed = { ...q, id: q._id, questions: JSON.parse(q.questions || "[]") };
        // Don't reveal correct answers to students
        if (req.user!.role === "student") {
          parsed.questions = parsed.questions.map((ques: any) => ({
            question: ques.question,
            options: ques.options,
            points: ques.points,
          }));
        }
        return parsed;
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to get quizzes" });
    }
  });

  // Get single quiz
  app.get("/api/quizzes/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const quiz = await QuizModel.findById(req.params.id).lean();
      if (!quiz) return res.status(404).json({ error: "Quiz not found" });
      const parsed: any = { ...quiz, id: (quiz as any)._id, questions: JSON.parse((quiz as any).questions || "[]") };
      if (req.user!.role === "student") {
        parsed.questions = parsed.questions.map((q: any) => ({
          question: q.question, options: q.options, points: q.points,
        }));
      }
      // Check if student already attempted
      if (req.user!.role === "student") {
        const attempt = await QuizAttemptModel.findOne({ quizId: req.params.id, studentId: req.user!.id }).lean();
        parsed.attempted = !!attempt;
        if (attempt) {
          parsed.myScore = (attempt as any).score;
          parsed.myPercentage = (attempt as any).percentage;
        }
      }
      res.json(parsed);
    } catch (error) {
      res.status(500).json({ error: "Failed to get quiz" });
    }
  });

  // Submit quiz attempt with cheating detection
  app.post("/api/quizzes/:id/submit", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
    try {
      const quiz = await QuizModel.findById(req.params.id).lean();
      if (!quiz) return res.status(404).json({ error: "Quiz not found" });
      if (!(quiz as any).isActive) return res.status(400).json({ error: "Quiz is no longer active" });

      const existing = await QuizAttemptModel.findOne({ quizId: req.params.id, studentId: req.user!.id }).lean();
      if (existing) return res.status(400).json({ error: "Already submitted" });

      const data = submitQuizSchema.parse(req.body);
      const questions = JSON.parse((quiz as any).questions || "[]");

      // Grade the quiz
      let score = 0;
      let totalPoints = 0;
      questions.forEach((q: any, i: number) => {
        totalPoints += q.points || 10;
        if (data.answers[i] === q.correctAnswer) {
          score += q.points || 10;
        }
      });
      const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;

      // AI Cheating Detection Score
      const cheatingFlags: string[] = [];
      let cheatingScore = 0;

      if (data.tabSwitches > 3) {
        cheatingFlags.push(`Switched tabs ${data.tabSwitches} times`);
        cheatingScore += Math.min(data.tabSwitches * 5, 30);
      }
      if (data.copyPasteAttempts > 0) {
        cheatingFlags.push(`${data.copyPasteAttempts} copy-paste attempt(s)`);
        cheatingScore += data.copyPasteAttempts * 15;
      }
      if (data.rightClickAttempts > 2) {
        cheatingFlags.push(`${data.rightClickAttempts} right-click attempt(s)`);
        cheatingScore += Math.min(data.rightClickAttempts * 5, 15);
      }
      if (data.suspiciousTimePatterns > 2) {
        cheatingFlags.push(`${data.suspiciousTimePatterns} suspicious time patterns`);
        cheatingScore += data.suspiciousTimePatterns * 10;
      }
      cheatingScore = Math.min(cheatingScore, 100);
      const isFlagged = cheatingScore >= 40;

      const attempt = await QuizAttemptModel.create({
        quizId: req.params.id,
        studentId: req.user!.id,
        studentName: req.user!.name,
        answers: JSON.stringify(data.answers),
        score,
        totalPoints,
        percentage,
        startedAt: new Date(Date.now() - ((quiz as any).duration || 30) * 60000),
        submittedAt: new Date(),
        tabSwitches: data.tabSwitches,
        copyPasteAttempts: data.copyPasteAttempts,
        rightClickAttempts: data.rightClickAttempts,
        suspiciousTimePatterns: data.suspiciousTimePatterns,
        cheatingScore,
        cheatingFlags: JSON.stringify(cheatingFlags),
        isFlagged,
      });

      res.json({
        ...attempt.toObject(),
        id: attempt._id,
        score,
        totalPoints,
        percentage,
        cheatingScore,
        isFlagged,
        cheatingFlags,
      });
    } catch (error: any) {
      if (error?.code === 11000) return res.status(400).json({ error: "Already submitted" });
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      console.error("Submit quiz error:", error);
      res.status(500).json({ error: "Failed to submit quiz" });
    }
  });

  // Get quiz results/attempts (for teacher)
  app.get("/api/quizzes/:id/attempts", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
    try {
      const attempts = await QuizAttemptModel.find({ quizId: req.params.id }).sort({ submittedAt: -1 }).lean();
      const parsed = attempts.map((a: any) => ({
        ...a,
        id: a._id,
        answers: JSON.parse(a.answers || "[]"),
        cheatingFlags: JSON.parse(a.cheatingFlags || "[]"),
      }));
      res.json(parsed);
    } catch (error) {
      res.status(500).json({ error: "Failed to get attempts" });
    }
  });

  // Toggle quiz active status
  app.patch("/api/quizzes/:id/toggle", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
    try {
      const quiz = await QuizModel.findById(req.params.id);
      if (!quiz) return res.status(404).json({ error: "Quiz not found" });
      quiz.isActive = !quiz.isActive;
      await quiz.save();
      res.json({ id: quiz._id, isActive: quiz.isActive });
    } catch (error) {
      res.status(500).json({ error: "Failed to toggle quiz" });
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // MODULE 4: Predictive Student Performance
  // ════════════════════════════════════════════════════════════════════

  // Calculate/update student performance prediction
  app.post("/api/performance/predict", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const studentId = req.user!.role === "student" ? req.user!.id : (req.body.studentId || req.user!.id);
      const student = await UserModel.findById(studentId).lean();
      if (!student) return res.status(404).json({ error: "Student not found" });

      // Gather data from all modules
      const attendanceRecords = await AttendanceRecordModel.find({ studentId }).lean();
      const totalSessions = await AttendanceSessionModel.countDocuments({ status: "closed" });
      const attendancePercent = totalSessions > 0 ? Math.round((attendanceRecords.length / totalSessions) * 100) : 75;

      const quizAttempts = await QuizAttemptModel.find({ studentId }).lean();
      const quizAverage = quizAttempts.length > 0
        ? Math.round(quizAttempts.reduce((sum, a: any) => sum + (a.percentage || 0), 0) / quizAttempts.length)
        : 50;

      const feedbacks = await FeedbackModel.find({ studentId }).lean();
      const feedbackCount = feedbacks.length;

      // Simple engagement score based on activity
      const engagementScore = Math.min(100, Math.round(
        (attendancePercent * 0.3) + (quizAverage * 0.3) + (Math.min(feedbackCount * 10, 40))
      ));

      // Predictive model: weighted scoring
      const weightedScore = (attendancePercent * 0.25) + (quizAverage * 0.35) + (engagementScore * 0.2) + (feedbackCount > 0 ? 20 : 0);
      
      let predictedGrade: string;
      let failProbability: number;
      let riskLevel: string;

      if (weightedScore >= 85) { predictedGrade = "A+"; failProbability = 2; riskLevel = "low"; }
      else if (weightedScore >= 75) { predictedGrade = "A"; failProbability = 5; riskLevel = "low"; }
      else if (weightedScore >= 65) { predictedGrade = "B+"; failProbability = 10; riskLevel = "low"; }
      else if (weightedScore >= 55) { predictedGrade = "B"; failProbability = 20; riskLevel = "medium"; }
      else if (weightedScore >= 45) { predictedGrade = "C"; failProbability = 35; riskLevel = "medium"; }
      else if (weightedScore >= 35) { predictedGrade = "D"; failProbability = 55; riskLevel = "high"; }
      else { predictedGrade = "F"; failProbability = 80; riskLevel = "high"; }

      const recommendations: string[] = [];
      if (attendancePercent < 75) recommendations.push("Improve attendance - currently below 75%");
      if (quizAverage < 50) recommendations.push("Focus on quiz preparation - average below 50%");
      if (feedbackCount === 0) recommendations.push("Submit feedback to teachers to improve engagement");
      if (engagementScore < 50) recommendations.push("Increase class participation and activities");
      if (failProbability > 30) recommendations.push("Schedule one-on-one meeting with academic advisor");

      const performance = await StudentPerformanceModel.findOneAndUpdate(
        { studentId },
        {
          studentId,
          studentName: (student as any).name,
          attendance: attendancePercent,
          assignmentsSubmitted: quizAttempts.length,
          assignmentsTotal: await QuizModel.countDocuments({ isActive: true }),
          quizAverage,
          feedbackSentiment: 0,
          engagementScore,
          predictedGrade,
          failProbability,
          riskLevel,
          recommendations: JSON.stringify(recommendations),
          predictedAt: new Date(),
          updatedAt: new Date(),
        },
        { upsert: true, new: true },
      );

      res.json({
        ...performance.toObject(),
        id: performance._id,
        recommendations,
      });
    } catch (error) {
      console.error("Predict error:", error);
      res.status(500).json({ error: "Failed to predict performance" });
    }
  });

  // Get my performance
  app.get("/api/performance/my", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
    try {
      const perf = await StudentPerformanceModel.findOne({ studentId: req.user!.id }).lean();
      if (!perf) return res.json(null);
      res.json({
        ...perf,
        id: (perf as any)._id,
        recommendations: JSON.parse((perf as any).recommendations || "[]"),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get performance" });
    }
  });

  // Get all students' performance (teacher/admin)
  app.get("/api/performance/all", authenticateToken, requireRole("teacher", "admin"), async (_req: AuthRequest, res) => {
    try {
      const perfs = await StudentPerformanceModel.find({}).sort({ failProbability: -1 }).lean();
      const parsed = perfs.map((p: any) => ({
        ...p,
        id: p._id,
        recommendations: JSON.parse(p.recommendations || "[]"),
      }));
      res.json(parsed);
    } catch (error) {
      res.status(500).json({ error: "Failed to get performances" });
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // MODULE 5: RAG Chatbot (Course-Material-Aware)
  // ════════════════════════════════════════════════════════════════════

  // Upload course document
  app.post("/api/rag/documents", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
    try {
      const { title, subject, content } = req.body as { title?: string; subject?: string; content?: string };
      if (!title?.trim() || !content?.trim()) {
        return res.status(400).json({ error: "Title and content are required" });
      }

      const teacherId = await getTeacherId(req.user!);

      // Split content into chunks (500 char each with overlap)
      const chunkSize = 500;
      const overlap = 100;
      const chunks: string[] = [];
      for (let i = 0; i < content.length; i += chunkSize - overlap) {
        chunks.push(content.substring(i, i + chunkSize));
      }

      const doc = await CourseDocumentModel.create({
        teacherId,
        title: title.trim(),
        subject: subject?.trim() || "General",
        content,
        chunks: JSON.stringify(chunks),
        uploadedBy: req.user!.id,
      });

      res.status(201).json({ ...doc.toObject(), id: doc._id, chunksCount: chunks.length });
    } catch (error) {
      console.error("Upload document error:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  // List course documents
  app.get("/api/rag/documents", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const query: any = {};
      if (req.query.subject) query.subject = req.query.subject;
      const docs = await CourseDocumentModel.find(query).select("-content -chunks").sort({ createdAt: -1 }).lean();
      res.json(docs.map((d: any) => ({ ...d, id: d._id })));
    } catch (error) {
      res.status(500).json({ error: "Failed to get documents" });
    }
  });

  // Delete course document
  app.delete("/api/rag/documents/:id", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
    try {
      await CourseDocumentModel.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // RAG Chat - Ask question with course material context
  app.post("/api/rag/chat", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { question, subject } = req.body as { question?: string; subject?: string };
      if (!question?.trim()) return res.status(400).json({ error: "Question is required" });

      // Find relevant documents
      const query: any = {};
      if (subject) query.subject = subject;
      const allDocs = await CourseDocumentModel.find(query).lean();

      // Simple keyword-based retrieval (simulated vector search)
      const queryWords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const scoredChunks: Array<{ chunk: string; score: number; docTitle: string }> = [];

      for (const doc of allDocs) {
        const chunks: string[] = JSON.parse((doc as any).chunks || "[]");
        for (const chunk of chunks) {
          const chunkLower = chunk.toLowerCase();
          let score = 0;
          for (const word of queryWords) {
            if (chunkLower.includes(word)) score += 1;
          }
          if (score > 0) {
            scoredChunks.push({ chunk, score, docTitle: (doc as any).title });
          }
        }
      }

      // Sort by relevance and take top 3
      scoredChunks.sort((a, b) => b.score - a.score);
      const topChunks = scoredChunks.slice(0, 3);

      let answer: string;
      const sources = topChunks.map(c => ({ documentTitle: c.docTitle, chunk: c.chunk.substring(0, 200), relevanceScore: c.score }));

      if (topChunks.length > 0) {
        const context = topChunks.map(c => c.chunk).join("\n\n");
        const prompt = `Based on the following course material, answer the student's question. Only use information from the provided material. If the answer is not in the material, say so.\n\nCourse Material:\n${context}\n\nQuestion: ${question}\n\nAnswer:`;
        try {
          answer = await aiService.generateText(prompt);
        } catch {
          answer = `Based on the course material about "${topChunks[0].docTitle}", here's what I found:\n\n${topChunks[0].chunk.substring(0, 500)}`;
        }
      } else {
        answer = "I couldn't find relevant information in the uploaded course materials. Please try rephrasing your question or check if the relevant material has been uploaded.";
      }

      // Save chat history
      await RagChatModel.create({
        userId: req.user!.id,
        question: question.trim(),
        answer,
        sources: JSON.stringify(sources),
        subject: subject || "General",
      });

      res.json({ answer, sources, documentsSearched: allDocs.length });
    } catch (error) {
      console.error("RAG chat error:", error);
      res.status(500).json({ error: "Failed to process question" });
    }
  });

  // Get RAG chat history
  app.get("/api/rag/history", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const chats = await RagChatModel.find({ userId: req.user!.id }).sort({ createdAt: -1 }).limit(50).lean();
      const parsed = chats.map((c: any) => ({
        ...c,
        id: c._id,
        sources: JSON.parse(c.sources || "[]"),
      }));
      res.json(parsed);
    } catch (error) {
      res.status(500).json({ error: "Failed to get chat history" });
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // LMS INTEGRATION: Google Classroom, Moodle, Microsoft Teams
  // ════════════════════════════════════════════════════════════════════

  // --- Google Classroom OAuth flow ---
  app.get("/api/lms/google/auth-url", authenticateToken, requireRole("admin"), async (_req: AuthRequest, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.BACKEND_PORT || 5001}/api/lms/google/callback`;
    if (!clientId) return res.status(400).json({ error: "GOOGLE_CLIENT_ID not configured in .env" });

    const scopes = [
      "https://www.googleapis.com/auth/classroom.courses.readonly",
      "https://www.googleapis.com/auth/classroom.rosters.readonly",
      "https://www.googleapis.com/auth/classroom.coursework.students.readonly",
      "https://www.googleapis.com/auth/classroom.profile.emails",
    ].join(" ");

    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;
    res.json({ url });
  });

  // Google OAuth callback
  app.get("/api/lms/google/callback", async (req, res) => {
    const code = req.query.code as string;
    if (!code) return res.status(400).send("Missing authorization code");

    try {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.BACKEND_PORT || 5001}/api/lms/google/callback`;

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId || "",
          client_secret: clientSecret || "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenRes.json() as any;
      if (!tokenData.access_token) {
        return res.status(400).json({ error: "Failed to get access token", details: tokenData });
      }

      // Store token in memory (production: store in DB)
      (global as any).__googleAccessToken = tokenData.access_token;
      (global as any).__googleRefreshToken = tokenData.refresh_token;

      // Redirect back to frontend
      const frontendUrl = process.env.NODE_ENV === "production" ? "/" : "http://localhost:5173";
      res.redirect(`${frontendUrl}/admin?lms=google&status=connected`);
    } catch (error) {
      console.error("Google OAuth error:", error);
      res.status(500).json({ error: "OAuth failed" });
    }
  });

  // Import courses from Google Classroom
  app.post("/api/lms/google/import-courses", authenticateToken, requireRole("admin"), async (_req: AuthRequest, res) => {
    const accessToken = (global as any).__googleAccessToken;
    if (!accessToken) return res.status(401).json({ error: "Google Classroom not connected. Connect first via /api/lms/google/auth-url" });

    try {
      const coursesRes = await fetch("https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const coursesData = await coursesRes.json() as any;
      if (!coursesData.courses) return res.json({ imported: 0, courses: [] });

      const imported: any[] = [];
      for (const course of coursesData.courses) {
        // Create teacher entry for each course
        const existing = await TeacherModel.findOne({
          name: course.ownerId || course.name,
          subject: course.name,
        }).lean();

        if (!existing) {
          // Get teacher info
          let teacherName = course.name;
          try {
            const teacherRes = await fetch(`https://classroom.googleapis.com/v1/courses/${course.id}/teachers`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            const teacherData = await teacherRes.json() as any;
            if (teacherData.teachers?.[0]?.profile?.name?.fullName) {
              teacherName = teacherData.teachers[0].profile.name.fullName;
            }
          } catch { /* ignore */ }

          const teacher = await storage.createTeacher({
            name: teacherName,
            department: course.section || "General",
            subject: course.name,
          });
          imported.push({ id: teacher.id, name: teacherName, subject: course.name, source: "google_classroom" });
        }
      }

      res.json({ imported: imported.length, total: coursesData.courses.length, courses: imported });
    } catch (error) {
      console.error("Google import error:", error);
      res.status(500).json({ error: "Failed to import courses" });
    }
  });

  // Import students from Google Classroom
  app.post("/api/lms/google/import-students", authenticateToken, requireRole("admin"), async (_req: AuthRequest, res) => {
    const accessToken = (global as any).__googleAccessToken;
    if (!accessToken) return res.status(401).json({ error: "Google Classroom not connected" });

    try {
      const coursesRes = await fetch("https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const coursesData = await coursesRes.json() as any;
      if (!coursesData.courses) return res.json({ imported: 0 });

      let totalImported = 0;
      for (const course of coursesData.courses) {
        const studentsRes = await fetch(`https://classroom.googleapis.com/v1/courses/${course.id}/students`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const studentsData = await studentsRes.json() as any;
        if (!studentsData.students) continue;

        for (const student of studentsData.students) {
          const email = student.profile?.emailAddress;
          const name = student.profile?.name?.fullName;
          if (!email || !name) continue;

          const exists = await storage.getUserByEmail(email);
          if (!exists) {
            await storage.createUser({
              username: email.split("@")[0],
              email,
              password: "changeme123",
              name,
              role: "student",
              department: course.section || "General",
            });
            totalImported++;
          }
        }
      }

      res.json({ imported: totalImported });
    } catch (error) {
      console.error("Student import error:", error);
      res.status(500).json({ error: "Failed to import students" });
    }
  });

  // --- Moodle integration ---
  app.post("/api/lms/moodle/import", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
    const moodleUrl = process.env.MOODLE_URL || (req.body as any).moodleUrl;
    const moodleToken = process.env.MOODLE_TOKEN || (req.body as any).moodleToken;
    if (!moodleUrl || !moodleToken) {
      return res.status(400).json({ error: "MOODLE_URL and MOODLE_TOKEN required (set in .env or request body)" });
    }

    try {
      // Get courses
      const coursesRes = await fetch(
        `${moodleUrl}/webservice/rest/server.php?wstoken=${moodleToken}&wsfunction=core_course_get_courses&moodlewsrestformat=json`
      );
      const courses = await coursesRes.json() as any[];

      let teachersImported = 0;
      let studentsImported = 0;

      for (const course of courses) {
        if (course.id === 1) continue; // Skip "Site" course

        // Create teacher/subject entry
        const existing = await TeacherModel.findOne({ subject: course.fullname || course.shortname }).lean();
        if (!existing) {
          await storage.createTeacher({
            name: course.fullname || course.shortname,
            department: course.categoryid ? `Category ${course.categoryid}` : "General",
            subject: course.shortname || course.fullname,
          });
          teachersImported++;
        }

        // Get enrolled users
        const usersRes = await fetch(
          `${moodleUrl}/webservice/rest/server.php?wstoken=${moodleToken}&wsfunction=core_enrol_get_enrolled_users&courseid=${course.id}&moodlewsrestformat=json`
        );
        const users = await usersRes.json() as any[];

        for (const user of users) {
          if (!user.email) continue;
          const exists = await storage.getUserByEmail(user.email);
          if (!exists) {
            const isTeacher = user.roles?.some((r: any) => r.shortname === "editingteacher" || r.shortname === "teacher");
            await storage.createUser({
              username: user.username || user.email.split("@")[0],
              email: user.email,
              password: "changeme123",
              name: `${user.firstname} ${user.lastname}`,
              role: isTeacher ? "teacher" : "student",
              department: course.categoryid ? `Category ${course.categoryid}` : "General",
            });
            if (isTeacher) teachersImported++;
            else studentsImported++;
          }
        }
      }

      res.json({ courses: courses.length - 1, teachersImported, studentsImported });
    } catch (error) {
      console.error("Moodle import error:", error);
      res.status(500).json({ error: "Failed to import from Moodle" });
    }
  });

  // --- Bulk CSV import for students ---
  app.post("/api/lms/csv/import-students", authenticateToken, requireRole("admin"), upload.single("file"), async (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: "CSV file required" });

    const results: any[] = [];
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    try {
      const stream = Readable.from(req.file.buffer);
      await new Promise<void>((resolve, reject) => {
        stream
          .pipe(csv())
          .on("data", (row: any) => results.push(row))
          .on("end", resolve)
          .on("error", reject);
      });

      for (const row of results) {
        const email = row.email || row.Email || row.EMAIL;
        const name = row.name || row.Name || row.NAME || row.full_name || `${row.first_name || ""} ${row.last_name || ""}`.trim();
        const department = row.department || row.Department || row.DEPARTMENT || "General";
        const role = (row.role || row.Role || "student").toLowerCase();

        if (!email || !name) {
          errors.push(`Skipped row: missing email or name`);
          skipped++;
          continue;
        }

        const exists = await storage.getUserByEmail(email);
        if (exists) {
          skipped++;
          continue;
        }

        await storage.createUser({
          username: email.split("@")[0],
          email,
          password: "changeme123",
          name,
          role: role === "teacher" ? "teacher" : "student",
          department,
        });
        imported++;
      }

      res.json({ imported, skipped, errors: errors.slice(0, 10), total: results.length });
    } catch (error) {
      console.error("CSV import error:", error);
      res.status(500).json({ error: "Failed to parse CSV" });
    }
  });

  // --- LMS connection status ---
  app.get("/api/lms/status", authenticateToken, requireRole("admin"), async (_req: AuthRequest, res) => {
    res.json({
      google: {
        connected: !!(global as any).__googleAccessToken,
        configured: !!process.env.GOOGLE_CLIENT_ID,
      },
      moodle: {
        configured: !!(process.env.MOODLE_URL && process.env.MOODLE_TOKEN),
        url: process.env.MOODLE_URL || null,
      },
      microsoft: {
        configured: !!(process.env.MS_CLIENT_ID && process.env.MS_TENANT_ID),
      },
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ██  SIMPLIFII ERP SCRAPER (ABES College Portal)
  // ══════════════════════════════════════════════════════════════

  // Store scraping progress per user (in-memory, non-persistent)
  const scrapeProgress = new Map<string, string[]>();

  // --- Scrape data from Simplifii portal ---
  app.post("/api/simplifii/scrape", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Simplifii username and password are required" });
      }

      const userId = (req as any).user?.id;
      const progressKey = userId || "default";
      scrapeProgress.set(progressKey, []);

      const onProgress = (msg: string) => {
        const arr = scrapeProgress.get(progressKey) || [];
        arr.push(msg);
        scrapeProgress.set(progressKey, arr);
      };

      // Dynamic import to avoid loading puppeteer at startup
      const { scrapeSimplifii, importScrapedData } = await import("./simplifii-scraper");

      onProgress("🚀 Starting Simplifii scraper...");

      const scrapedData = await scrapeSimplifii({ username, password }, onProgress);

      onProgress("💾 Importing data into ClassIntel AI...");

      // Import into MongoDB
      const db = (await import("mongoose")).default.connection.db;
      const importResult = await importScrapedData(db, scrapedData, userId);

      onProgress("✅ All done!");

      res.json({
        success: true,
        student: {
          name: scrapedData.studentName,
          enrollmentNo: scrapedData.enrollmentNo,
          branch: scrapedData.branch,
          semester: scrapedData.semester,
        },
        scraped: {
          attendance: scrapedData.attendance.length,
          lectures: scrapedData.lectures.length,
          teachers: scrapedData.teachers.length,
        },
        imported: importResult,
        rawData: {
          attendance: scrapedData.attendance,
          teachers: scrapedData.teachers,
          lecturesSample: scrapedData.lectures.slice(0, 20),
        },
      });
    } catch (error: any) {
      console.error("Simplifii scrape error:", error);
      res.status(500).json({
        error: error.message || "Failed to scrape Simplifii portal",
        hint: "Make sure your credentials are correct and the portal is accessible.",
      });
    }
  });

  // --- Get scraping progress ---
  app.get("/api/simplifii/progress", authenticateToken, async (req: AuthRequest, res) => {
    const userId = (req as any).user?.id || "default";
    const progress = scrapeProgress.get(userId) || [];
    res.json({ progress });
  });

  // --- Get imported Simplifii data for current user ---
  app.get("/api/simplifii/my-data", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const userId = (req as any).user?.id;
      const db = (await import("mongoose")).default.connection.db;

      const [attendanceSummary, attendanceRecords, teachers] = await Promise.all([
        db!.collection("attendance_summary").find({ studentId: userId }).toArray(),
        db!.collection("attendance_records").find({
          studentId: userId,
          importedFrom: "simplifii",
        }).sort({ date: -1 }).limit(100).toArray(),
        db!.collection("teachers").find({ importedFrom: "simplifii" }).toArray(),
      ]);

      res.json({
        attendanceSummary,
        recentLectures: attendanceRecords,
        teachers,
        linked: attendanceSummary.length > 0,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
