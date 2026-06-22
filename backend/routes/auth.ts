import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import crypto from "crypto";
import { storage } from "../storage";
import { signupSchema, loginSchema } from "@shared/schema";
import {
  authenticateToken,
  requireRole,
  AuthRequest,
  JWT_SECRET,
  revokedTokenJtis,
  authRateLimiter,
  upload,
  recordAuditLog
} from "./common";
import csv from "csv-parser";
import { Readable } from "stream";

const router = Router();

router.post("/auth/signup", authRateLimiter, async (req, res) => {
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

    await recordAuditLog(user.id, user.name, user.role, "signup", {
      detail: `User registered with email ${user.email}`,
      ip: req.ip
    });

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

router.post("/auth/login", authRateLimiter, async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);
    
    const user = (await storage.getUserByEmail(data.email)) || (await storage.getUserByUsername(data.email));
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

    await recordAuditLog(user.id, user.name, user.role, "login", {
      detail: `User logged in`,
      ip: req.ip
    });

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

router.get("/auth/me", authenticateToken, async (req: AuthRequest, res) => {
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

router.post("/auth/logout", authenticateToken, async (req: AuthRequest, res) => {
  const jti = req.tokenJti;
  const exp = req.tokenExp;
  if (!jti || !exp) {
    return res.json({ ok: true });
  }
  const expiresAtMs = exp * 1000;
  revokedTokenJtis.set(jti, expiresAtMs);
  res.json({ ok: true });
});

// Protected remote seed endpoint — only works when SEED_SECRET env var is set
router.post("/admin/seed", async (req, res) => {
  try {
    const secret = process.env.SEED_SECRET;
    if (!secret) {
      return res.status(403).json({ error: "Remote seeding is not enabled on this server" });
    }
    const provided = req.headers["x-seed-secret"] || req.body?.seedSecret;
    if (provided !== secret) {
      return res.status(403).json({ error: "Invalid seed secret" });
    }
    const { seed } = await import("../seed");
    await seed();
    await recordAuditLog("system", "System", "admin", "db_seed", {
      detail: "Database seeded successfully via remote seed",
      ip: req.ip
    });
    res.json({ ok: true, message: "Database seeded successfully" });
  } catch (error: any) {
    console.error("Remote seed error:", error);
    res.status(500).json({ error: error?.message || "Seeding failed" });
  }
});

router.post("/admin/students/bulk-import", authenticateToken, requireRole("admin"), upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const students: any[] = [];
    const errors: string[] = [];

    const readableStream = Readable.from(req.file.buffer.toString());
    
    await new Promise((resolve, reject) => {
      readableStream
        .pipe(csv())
        .on('data', (row) => {
          try {
            if (!row.name || !row.email) {
              errors.push(`Row with email ${row.email || 'unknown'} missing name or email`);
              return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(row.email)) {
              errors.push(`Invalid email format: ${row.email}`);
              return;
            }

            students.push({
              name: row.name.trim(),
              email: row.email.trim().toLowerCase(),
              username: row.email.trim().toLowerCase().split("@")[0],
              password: row.password?.trim() || "student123",
              department: row.department?.trim() || undefined,
              role: "student",
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

    const createdStudents = [];
    for (const studentData of students) {
      try {
        const existing = await storage.getUserByEmail(studentData.email);
        if (existing) {
          errors.push(`Student with email ${studentData.email} already exists`);
          continue;
        }
        const student = await storage.createUser(studentData);
        createdStudents.push({
          id: student.id,
          name: student.name,
          email: student.email,
          role: student.role,
          department: student.department
        });
      } catch (error) {
        errors.push(`Failed to create student ${studentData.email}: ${error}`);
      }
    }

    if (errors.length > 0) {
      return res.status(207).json({ 
        message: "Partial import completed", 
        imported: createdStudents.length,
        total: students.length,
        errors: errors,
        students: createdStudents
      });
    }

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, "student_bulk_import", {
      detail: `Successfully imported ${createdStudents.length} students from CSV`,
      ip: req.ip
    });

    res.json({
      message: "All students imported successfully",
      imported: createdStudents.length,
      total: students.length,
      students: createdStudents
    });
  } catch (error: any) {
    console.error("Bulk import students error:", error);
    res.status(500).json({ error: error?.message || "Failed to import students" });
  }
});


router.post("/office/slots", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
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

router.get("/office/slots/:teacherId", async (req, res) => {
  try {
    const slots = await storage.listOfficeSlots(req.params.teacherId);
    res.json(slots);
  } catch (error) {
    console.error("List slots error:", error);
    res.status(500).json({ error: "Failed to list slots" });
  }
});

router.post("/office/slots/:slotId/book", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    const booking = await storage.bookOfficeSlot(req.params.slotId, req.user!.id);
    res.status(201).json(booking);
  } catch (error) {
    console.error("Book slot error:", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to book slot" });
  }
});

router.get("/office/bookings/my", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    const bookings = await storage.listMyBookings(req.user!.id);
    res.json(bookings);
  } catch (error) {
    console.error("List my bookings error:", error);
    res.status(500).json({ error: "Failed to list bookings" });
  }
});

router.post("/office/bookings/:bookingId/cancel", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    await storage.cancelBooking(req.params.bookingId, req.user!.id);
    res.json({ ok: true });
  } catch (error) {
    console.error("Cancel booking error:", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to cancel booking" });
  }
});

export default router;
