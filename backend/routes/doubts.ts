import { Router } from "express";
import { storage } from "../storage";
import { TeacherModel } from "@shared/schema";
import {
  authenticateToken,
  requireRole,
  AuthRequest
} from "./common";

const router = Router();

router.post("/doubts", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    const { teacherId, question } = req.body as { teacherId?: string; question?: string };
    if (!teacherId || !question?.trim()) {
      return res.status(400).json({ error: "Teacher ID and question are required" });
    }

    const teacher = await storage.getTeacher(teacherId.trim());
    if (!teacher) {
      return res.status(400).json({ error: "Invalid teacherId" });
    }

    const doubt = await storage.createDoubt({
      teacherId: teacher.id,
      studentId: req.user!.id,
      studentName: req.user!.name,
      question: question.trim(),
    });
    res.json(doubt);
  } catch (error) {
    console.error("Create doubt error:", error);
    res.status(500).json({ error: "Failed to create doubt" });
  }
});

router.get("/doubts/my", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    const items = await storage.getDoubtsByStudent(req.user!.id);
    res.json(items);
  } catch (error) {
    console.error("Get student doubts error:", error);
    res.status(500).json({ error: "Failed to get doubts" });
  }
});

router.get("/doubts/teacher", authenticateToken, requireRole("teacher"), async (req: AuthRequest, res) => {
  try {
    const teacherIds = new Set<string>();

    const directTeacher = await storage.getTeacher(req.user!.id);
    if (directTeacher?.id) teacherIds.add(directTeacher.id);

    const normalized = (req.user!.name || "").trim().replace(/\s+/g, " ");
    if (normalized) {
      const escaped = normalized
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\s+/g, "\\s+");

      const matches = await TeacherModel.find({
        name: { $regex: `^${escaped}$`, $options: "i" },
      })
        .select("_id")
        .lean();

      for (const t of matches as any[]) {
        const id = (t?._id ?? t?.id)?.toString?.() ?? (t?._id ?? t?.id);
        if (id) teacherIds.add(String(id));
      }
    }

    if (teacherIds.size === 0) {
      return res.status(404).json({ error: "No teacher profile linked to your account" });
    }

    const batches = await Promise.all(Array.from(teacherIds).map((id) => storage.getDoubtsByTeacher(id)));
    const merged = batches.flat();
    const deduped = Array.from(new Map(merged.map((d: any) => [d.id || d._id, d])).values());
    const sorted = deduped
      .map((d: any) => ({ ...d, teacherName: undefined }))
      .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    res.json(sorted);
  } catch (error) {
    console.error("Get teacher doubts error:", error);
    res.status(500).json({ error: "Failed to get doubts" });
  }
});

router.post("/doubts/:id/answer", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
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

export default router;
