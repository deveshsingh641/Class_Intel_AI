import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import {
  FeedbackModel,
  insertFeedbackSchema,
  insertReplySchema
} from "@shared/schema";
import {
  authenticateToken,
  requireRole,
  AuthRequest,
  ABUSIVE_WORDS,
  escapeRegex,
  parsePositiveInt,
  upload
} from "./common";

const router = Router();

router.get("/feedback/teacher/:teacherId/summary", async (req, res) => {
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

router.get("/feedback/teacher/:teacherId/paged", async (req, res) => {
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

router.get("/feedback/my-submissions", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const teacherIds = await storage.getStudentFeedbackTeachers(req.user!.id);
    res.json(teacherIds);
  } catch (error) {
    console.error("Get submissions error:", error);
    res.status(500).json({ error: "Failed to get submissions" });
  }
});

router.get("/feedback/my", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    const [feedbackList, teachersList] = await Promise.all([
      storage.getFeedbackByStudent(req.user!.id),
      storage.getTeachers(),
    ]);

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

router.post("/feedback/:feedbackId/read", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    const { feedbackId } = req.params;
    const updated = await storage.markFeedbackRead(feedbackId);
    res.json({ feedback: updated || null });
  } catch (error) {
    console.error("Mark feedback read error:", error);
    res.status(500).json({ error: "Failed to mark feedback as read" });
  }
});

router.post("/feedback/:feedbackId/flag", authenticateToken, async (req: AuthRequest, res) => {
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

router.get("/feedback/flags", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const flags = await storage.getFeedbackFlagsDetailed(status);
    res.json(flags);
  } catch (error) {
    console.error("Get feedback flags error:", error);
    res.status(500).json({ error: "Failed to get feedback flags" });
  }
});

router.post("/feedback/flags/:flagId/status", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
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

router.post("/feedback/:feedbackId/resolve", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
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
});

router.get("/feedback/reminder-status", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
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

router.get("/feedback/transcribe-enabled", (_req, res) => {
  const enabled = !!process.env.OPENAI_API_KEY;
  res.json({ enabled });
});

interface UploadedAudioFile {
  buffer: Buffer;
  mimetype?: string;
}

router.post("/feedback/transcribe", authenticateToken, requireRole("student"), upload.single("audio"), async (req: AuthRequest, res) => {
  return res.status(400).json({ error: "Voice feedback transcription is disabled in pure offline mode." });
});

router.post("/feedback", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    const body = {
      ...req.body,
      comment: req.body.comment && req.body.comment.trim() ? req.body.comment.trim() : undefined,
      doubt: req.body.doubt && req.body.doubt.trim() ? req.body.doubt.trim() : undefined,
    };
    
    if (process.env.NODE_ENV !== "production") {
      console.log("Feedback submission request:", { body, user: req.user });
    }
    const data = insertFeedbackSchema.parse(body);
    const studentId = req.user?.id || (req.user as any)?._id || (req.user as any)?.userId;
    if (!studentId) {
      return res.status(401).json({ error: "User context missing. Please log in again." });
    }

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

    const teacherId = (teacher as any).id || (teacher as any)._id || data.teacherId;

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
      return res.status(400).json({ error: error.errors[0].message, details: error.errors });
    }
    console.error("Create feedback error:", error);
    res.status(500).json({ error: "Failed to submit feedback", message: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.post("/qr-feedback/:teacherId", async (req: Request, res: Response) => {
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

router.get("/feedback/received", authenticateToken, requireRole("teacher"), async (req: AuthRequest, res) => {
  try {
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
      return {
        ...item,
        id: (item as any)._id?.toString() || (item as any).id,
        qualityScore,
        commentLength: commentLen,
        hasComment,
      };
    });

    res.json({ items: withInsights, total, page, limit });
  } catch (error) {
    console.error("Get teacher feedback error:", error);
    res.status(500).json({ error: "Failed to get teacher feedback" });
  }
});

// Reply Routes
router.get("/feedback/:feedbackId/replies", async (req, res) => {
  try {
    const replies = await storage.getRepliesByFeedback(req.params.feedbackId);
    res.json(replies);
  } catch (error) {
    console.error("Get replies error:", error);
    res.status(500).json({ error: "Failed to get replies" });
  }
});

router.post("/feedback/:feedbackId/replies", authenticateToken, async (req: AuthRequest, res) => {
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

router.delete("/replies/:replyId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    await storage.deleteReply(req.params.replyId, req.user!.id);
    res.json({ message: "Reply deleted successfully" });
  } catch (error) {
    console.error("Delete reply error:", error);
    res.status(500).json({ error: "Failed to delete reply" });
  }
});

// Favorites Routes
router.get("/favorites/my", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    const items = await storage.getFavoritesByStudent(req.user!.id);
    res.json(items.map((f) => f.teacherId));
  } catch (error) {
    console.error("Get favorites error:", error);
    res.status(500).json({ error: "Failed to get favorites" });
  }
});

router.post("/favorites/:teacherId", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    const { teacherId } = req.params;
    const favorite = await storage.addFavorite(req.user!.id, teacherId);
    res.status(201).json(favorite);
  } catch (error) {
    console.error("Add favorite error:", error);
    res.status(500).json({ error: "Failed to add favorite" });
  }
});

router.delete("/favorites/:teacherId", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    const { teacherId } = req.params;
    await storage.removeFavorite(req.user!.id, teacherId);
    res.json({ success: true });
  } catch (error) {
    console.error("Remove favorite error:", error);
    res.status(500).json({ error: "Failed to remove favorite" });
  }
});

// Admin-only: reassign a feedback to a different teacher
router.post("/admin/feedback/:feedbackId/reassign", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
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

export default router;
