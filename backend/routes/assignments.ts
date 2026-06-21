import { Router } from "express";
import { AssignmentModel, AssignmentSubmissionModel } from "@shared/schema";
import { authenticateToken, requireRole, AuthRequest, getTeacherId } from "./common";

const router = Router();

// POST /api/assignments — teacher creates assignment
router.post("/assignments", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    const { title, description, subject, dueDate, maxMarks } = req.body as {
      title?: string; description?: string; subject?: string; dueDate?: string; maxMarks?: number;
    };
    if (!title?.trim() || !description?.trim() || !subject?.trim() || !dueDate) {
      return res.status(400).json({ error: "Title, description, subject, and dueDate are required" });
    }
    const teacherId = await getTeacherId(req.user!);
    const doc = await AssignmentModel.create({
      teacherId,
      teacherName: req.user!.name || "Unknown",
      title: title.trim(),
      description: description.trim(),
      subject: subject.trim(),
      dueDate: new Date(dueDate),
      maxMarks: maxMarks ?? 100,
    });
    res.status(201).json(doc);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to create assignment" });
  }
});

// GET /api/assignments — list all active assignments (student/teacher)
router.get("/assignments", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const role = req.user!.role;
    let query: Record<string, unknown> = { isActive: true };

    if (role === "teacher" || role === "admin") {
      const teacherId = await getTeacherId(req.user!).catch(() => null);
      if (teacherId) query = { teacherId };
    }

    const docs = await AssignmentModel.find(query).sort({ dueDate: 1 }).lean();
    res.json(docs);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to fetch assignments" });
  }
});

// GET /api/assignments/:id — single assignment
router.get("/assignments/:id", authenticateToken, async (req, res) => {
  try {
    const doc = await AssignmentModel.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: "Assignment not found" });
    res.json(doc);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to fetch assignment" });
  }
});

// PATCH /api/assignments/:id/toggle — teacher deactivates assignment
router.patch("/assignments/:id/toggle", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    const teacherId = await getTeacherId(req.user!);
    const doc = await AssignmentModel.findOne({ _id: req.params.id, teacherId });
    if (!doc) return res.status(404).json({ error: "Assignment not found" });
    doc.isActive = !doc.isActive;
    await doc.save();
    res.json(doc);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to toggle assignment" });
  }
});

// POST /api/assignments/:id/submit — student submits
router.post("/assignments/:id/submit", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    const { text } = req.body as { text?: string };
    if (!text?.trim()) return res.status(400).json({ error: "Submission text is required" });

    const assignment = await AssignmentModel.findById(req.params.id);
    if (!assignment || !assignment.isActive) {
      return res.status(404).json({ error: "Assignment not found or closed" });
    }
    if (new Date() > assignment.dueDate) {
      return res.status(400).json({ error: "Submission deadline has passed" });
    }

    const submission = await AssignmentSubmissionModel.findOneAndUpdate(
      { assignmentId: req.params.id, studentId: req.user!.id },
      {
        assignmentId: req.params.id,
        studentId: req.user!.id,
        studentName: req.user!.name || "Unknown",
        text: text.trim(),
        submittedAt: new Date(),
      },
      { upsert: true, new: true }
    );
    res.status(201).json(submission);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to submit assignment" });
  }
});

// GET /api/assignments/:id/submissions — teacher views all submissions
router.get("/assignments/:id/submissions", authenticateToken, requireRole("teacher", "admin"), async (_req, res) => {
  try {
    const submissions = await AssignmentSubmissionModel.find({ assignmentId: _req.params.id }).sort({ submittedAt: 1 }).lean();
    res.json(submissions);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to fetch submissions" });
  }
});

// GET /api/assignments/my-submissions — student views their own submissions
router.get("/assignments/my-submissions/all", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    const submissions = await AssignmentSubmissionModel.find({ studentId: req.user!.id }).lean();
    res.json(submissions);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to fetch submissions" });
  }
});

// PUT /api/assignments/:id/submissions/:subId/grade — teacher grades
router.put("/assignments/:id/submissions/:subId/grade", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    const { grade, gradeFeedback } = req.body as { grade?: number; gradeFeedback?: string };
    if (grade === undefined) return res.status(400).json({ error: "Grade is required" });

    const submission = await AssignmentSubmissionModel.findByIdAndUpdate(
      req.params.subId,
      { grade, gradeFeedback: gradeFeedback || "", gradedAt: new Date() },
      { new: true }
    );
    if (!submission) return res.status(404).json({ error: "Submission not found" });
    res.json(submission);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to grade submission" });
  }
});

export default router;
