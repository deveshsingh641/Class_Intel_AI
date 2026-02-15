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

const rawJwtSecret = process.env.SESSION_SECRET;
const JWT_SECRET =
  rawJwtSecret ||
  (process.env.NODE_ENV === "production"
    ? ""
    : crypto.randomBytes(32).toString("hex"));
if (!JWT_SECRET) {
  throw new Error("SESSION_SECRET must be set in production");
}

console.log("✅ JWT_SECRET loaded from SESSION_SECRET:", JWT_SECRET.substring(0, 10) + "...");

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
      const { startTime, endTime } = req.body as { startTime?: string; endTime?: string };
      if (!startTime || !endTime) {
        return res.status(400).json({ error: "startTime and endTime are required" });
      }
      const start = new Date(startTime);
      const end = new Date(endTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        return res.status(400).json({ error: "Invalid time range" });
      }
      const slot = await storage.createOfficeSlot({ teacherId: req.user!.id, startTime: start, endTime: end });
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
      const doubts = await storage.getDoubtsByTeacher(req.user!.id);
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
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

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

  return httpServer;
}
