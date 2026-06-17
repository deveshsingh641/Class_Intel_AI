import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import {
  QuizModel,
  QuizAttemptModel,
  createQuizSchema,
  submitQuizSchema
} from "@shared/schema";
import {
  authenticateToken,
  requireRole,
  AuthRequest,
  getTeacherId
} from "./common";

const router = Router();

router.post("/quizzes", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
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

router.get("/quizzes", authenticateToken, async (req: AuthRequest, res) => {
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

router.get("/quizzes/:id", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const quiz = await QuizModel.findById(req.params.id).lean();
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });
    const parsed: any = { ...quiz, id: (quiz as any)._id, questions: JSON.parse((quiz as any).questions || "[]") };
    if (req.user!.role === "student") {
      parsed.questions = parsed.questions.map((q: any) => ({
        question: q.question, options: q.options, points: q.points,
      }));
    }
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

router.post("/quizzes/:id/submit", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    const quiz = await QuizModel.findById(req.params.id).lean();
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });
    if (!(quiz as any).isActive) return res.status(400).json({ error: "Quiz is no longer active" });

    const existing = await QuizAttemptModel.findOne({ quizId: req.params.id, studentId: req.user!.id }).lean();
    if (existing) return res.status(400).json({ error: "Already submitted" });

    const data = submitQuizSchema.parse(req.body);
    const questions = JSON.parse((quiz as any).questions || "[]");

    let score = 0;
    let totalPoints = 0;
    questions.forEach((q: any, i: number) => {
      totalPoints += q.points || 10;
      if (data.answers[i] === q.correctAnswer) {
        score += q.points || 10;
      }
    });
    const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;

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

router.get("/quizzes/:id/attempts", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
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

router.patch("/quizzes/:id/toggle", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
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

export default router;
