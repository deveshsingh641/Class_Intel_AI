import { Router } from "express";
import { z } from "zod";
import csv from "csv-parser";
import { Readable } from "stream";
import { storage } from "../storage";
import {
  insertTeacherSchema,
  updateTeacherSchema,
  TeacherModel
} from "@shared/schema";
import {
  authenticateToken,
  requireRole,
  AuthRequest,
  escapeRegex,
  parsePositiveInt,
  upload
} from "./common";

const router = Router();

router.get("/teachers", async (_req, res) => {
  try {
    const list = await storage.getTeachers();
    res.json(list);
  } catch (error) {
    console.error("Get teachers error:", error);
    res.status(500).json({ error: "Failed to get teachers" });
  }
});

router.get("/teachers/departments", async (_req, res) => {
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

router.get("/teachers/me", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
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

router.get("/teachers/search", async (req, res) => {
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

router.get("/teachers/feedback", async (_req, res) => {
  try {
    const list = await storage.getTeachers();
    res.json(list);
  } catch (error) {
    console.error("Get teachers (feedback) error:", error);
    res.status(500).json({ error: "Failed to get teachers" });
  }
});

router.get("/teachers/:id", async (req, res) => {
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

router.post("/teachers", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
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

router.post("/admin/teachers/bulk-import", authenticateToken, requireRole("admin"), upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const teachers: any[] = [];
    const errors: string[] = [];

    const readableStream = Readable.from(req.file.buffer.toString());
    
    await new Promise((resolve, reject) => {
      readableStream
        .pipe(csv())
        .on('data', (row) => {
          try {
            if (!row.name || !row.email || !row.department || !row.subject) {
              errors.push(`Row with email ${row.email || 'unknown'} missing required fields`);
              return;
            }

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

router.put("/teachers/:id/profile", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
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

router.delete("/teachers/:id", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
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

export default router;
