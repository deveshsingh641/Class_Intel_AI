import { Router } from "express";
import { StudentAchievementClaimModel, QuizAttemptModel, AttendanceRecordModel, FeedbackModel, DoubtModel, CourseDocumentModel } from "@shared/schema";
import { authenticateToken, AuthRequest } from "./common";

const router = Router();

// Achievement catalog — rules-based
const ACHIEVEMENT_CATALOG = [
  {
    id: "first_quiz",
    title: "First Quiz",
    description: "Submitted your first quiz",
    icon: "🎓",
    category: "academic",
    rarity: "common",
  },
  {
    id: "quiz_master",
    title: "Quiz Master",
    description: "Scored 90%+ on any quiz",
    icon: "🏆",
    category: "academic",
    rarity: "rare",
  },
  {
    id: "attendance_streak",
    title: "Attendance Star",
    description: "Maintained 75%+ overall attendance",
    icon: "🔥",
    category: "attendance",
    rarity: "common",
  },
  {
    id: "top_reviewer",
    title: "Top Reviewer",
    description: "Submitted 5 or more feedback reviews",
    icon: "⭐",
    category: "social",
    rarity: "uncommon",
  },
  {
    id: "curious_mind",
    title: "Curious Mind",
    description: "Asked 3 or more doubts",
    icon: "🧠",
    category: "engagement",
    rarity: "common",
  },
  {
    id: "scholar",
    title: "Scholar",
    description: "Accessed 5 or more course notes",
    icon: "📚",
    category: "academic",
    rarity: "uncommon",
  },
  {
    id: "perfect_score",
    title: "Perfect Score",
    description: "Scored 100% on any quiz",
    icon: "💯",
    category: "academic",
    rarity: "legendary",
  },
  {
    id: "feedback_pioneer",
    title: "Feedback Pioneer",
    description: "Gave your very first feedback",
    icon: "💬",
    category: "social",
    rarity: "common",
  },
  {
    id: "knowledge_seeker",
    title: "Knowledge Seeker",
    description: "Asked 10 or more doubts",
    icon: "🔍",
    category: "engagement",
    rarity: "rare",
  },
  {
    id: "quiz_veteran",
    title: "Quiz Veteran",
    description: "Completed 5 or more quizzes",
    icon: "🎯",
    category: "academic",
    rarity: "uncommon",
  },
];

// GET /api/achievements/catalog — all available achievements
router.get("/achievements/catalog", (_req, res) => {
  res.json(ACHIEVEMENT_CATALOG);
});

// GET /api/achievements/my — student's unlocked achievements
router.get("/achievements/my", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const studentId = req.user!.id;
    const claims = await StudentAchievementClaimModel.find({ studentId }).lean();
    const unlockedIds = new Set(claims.map((c) => c.achievementId));
    const result = ACHIEVEMENT_CATALOG.map((a) => ({
      ...a,
      unlocked: unlockedIds.has(a.id),
      unlockedAt: claims.find((c) => c.achievementId === a.id)?.unlockedAt ?? null,
    }));
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to fetch achievements" });
  }
});

// POST /api/achievements/evaluate — auto-evaluate and award new badges for the student
router.post("/achievements/evaluate", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const studentId = req.user!.id;
    const existing = await StudentAchievementClaimModel.find({ studentId }).lean();
    const unlockedIds = new Set(existing.map((c) => c.achievementId));

    const [quizAttempts, feedback, doubts] = await Promise.all([
      QuizAttemptModel.find({ studentId }).lean(),
      FeedbackModel.find({ studentId }).lean(),
      DoubtModel.find({ studentId }).lean(),
    ]);

    const newlyUnlocked: string[] = [];

    const tryUnlock = async (id: string) => {
      if (unlockedIds.has(id)) return;
      await StudentAchievementClaimModel.create({ studentId, achievementId: id }).catch(() => {});
      unlockedIds.add(id);
      newlyUnlocked.push(id);
    };

    // Quiz-based
    if (quizAttempts.length >= 1) await tryUnlock("first_quiz");
    if (quizAttempts.length >= 5) await tryUnlock("quiz_veteran");
    if (quizAttempts.some((a) => a.percentage >= 90)) await tryUnlock("quiz_master");
    if (quizAttempts.some((a) => a.percentage >= 100)) await tryUnlock("perfect_score");

    // Feedback-based
    if (feedback.length >= 1) await tryUnlock("feedback_pioneer");
    if (feedback.length >= 5) await tryUnlock("top_reviewer");

    // Doubts-based
    if (doubts.length >= 3) await tryUnlock("curious_mind");
    if (doubts.length >= 10) await tryUnlock("knowledge_seeker");

    // Attendance (use API estimate)
    const records = await AttendanceRecordModel.find({ studentId }).lean();
    if (records.length > 0) await tryUnlock("attendance_streak");

    const newAchievements = ACHIEVEMENT_CATALOG.filter((a) => newlyUnlocked.includes(a.id));
    res.json({ evaluated: true, newlyUnlocked: newAchievements, totalUnlocked: unlockedIds.size });
  } catch (error: any) {
    console.error("Achievements evaluate error:", error);
    res.status(500).json({ error: error?.message || "Failed to evaluate achievements" });
  }
});

export default router;
