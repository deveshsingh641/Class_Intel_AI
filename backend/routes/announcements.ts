import { Router } from "express";
import { AnnouncementModel } from "@shared/schema";
import { authenticateToken, requireRole, AuthRequest, getTeacherId } from "./common";

const router = Router();

// POST /api/announcements — teacher creates announcement
router.post("/announcements", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    const { title, body, subject, priority, expiresAt } = req.body as {
      title?: string; body?: string; subject?: string; priority?: string; expiresAt?: string;
    };
    if (!title?.trim() || !body?.trim() || !subject?.trim()) {
      return res.status(400).json({ error: "Title, body, and subject are required" });
    }
    const teacherId = await getTeacherId(req.user!);
    const teacherName = req.user!.name || "Unknown";
    const doc = await AnnouncementModel.create({
      teacherId,
      teacherName,
      title: title.trim(),
      body: body.trim(),
      subject: subject.trim(),
      priority: priority || "normal",
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });
    res.status(201).json(doc);
  } catch (error: any) {
    console.error("Create announcement error:", error);
    res.status(500).json({ error: error?.message || "Failed to create announcement" });
  }
});

// GET /api/announcements — all active announcements (student/teacher)
router.get("/announcements", authenticateToken, async (_req, res) => {
  try {
    const now = new Date();
    const docs = await AnnouncementModel.find({
      $or: [{ expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }, { expiresAt: null }],
    }).sort({ createdAt: -1 }).limit(50).lean();
    res.json(docs);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to fetch announcements" });
  }
});

// GET /api/announcements/my — teacher's own announcements
router.get("/announcements/my", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    const teacherId = await getTeacherId(req.user!);
    const docs = await AnnouncementModel.find({ teacherId }).sort({ createdAt: -1 }).lean();
    res.json(docs);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to fetch announcements" });
  }
});

// DELETE /api/announcements/:id
router.delete("/announcements/:id", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    const teacherId = await getTeacherId(req.user!);
    const doc = await AnnouncementModel.findOneAndDelete({ _id: req.params.id, teacherId });
    if (!doc) return res.status(404).json({ error: "Announcement not found or not yours" });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to delete announcement" });
  }
});

export default router;
