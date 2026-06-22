import { Router } from "express";
import { storage } from "../storage";
import {
  UserModel,
  FeedbackModel,
  StudentPerformanceModel,
  QuizModel,
  QuizAttemptModel,
  AttendanceRecordModel,
  AttendanceSessionModel,
  AuditLogModel
} from "@shared/schema";
import {
  authenticateToken,
  requireRole,
  AuthRequest,
  ABUSIVE_WORDS,
  escapeRegex,
  parsePositiveInt
} from "./common";

const router = Router();

// User Management Routes
router.get("/admin/users", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
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

router.patch("/admin/users/:userId/status", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
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

router.patch("/admin/users/:userId/role", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const { role } = req.body;
    const validRoles = ['admin', 'teacher', 'student'];
    
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

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

// Analytics Routes
router.get("/analytics/teacher/:teacherId/trends", async (req, res) => {
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

router.get("/analytics/departments/comparison", async (_req, res) => {
  try {
    const comparison = await storage.getDepartmentComparison();
    res.json(comparison);
  } catch (error) {
    console.error("Get department comparison error:", error);
    res.status(500).json({ error: "Failed to get department comparison" });
  }
});

router.get("/analytics/teacher/:teacherId/monthly", async (req, res) => {
  try {
    const { teacherId } = req.params;
    const monthly = await storage.getMonthlyPerformance(teacherId);
    res.json(monthly);
  } catch (error) {
    console.error("Get monthly performance error:", error);
    res.status(500).json({ error: "Failed to get monthly performance" });
  }
});

router.get("/analytics/teacher/:teacherId/improvement", async (req, res) => {
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

// Leaderboard Routes
router.get("/leaderboard/top-rated", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const topTeachers = await storage.getTopRatedTeachers(limit);
    res.json(topTeachers);
  } catch (error) {
    console.error("Get top rated teachers error:", error);
    res.status(500).json({ error: "Failed to get top rated teachers" });
  }
});

router.get("/leaderboard/most-feedback", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const topTeachers = await storage.getMostFeedbackTeachers(limit);
    res.json(topTeachers);
  } catch (error) {
    console.error("Get most feedback teachers error:", error);
    res.status(500).json({ error: "Failed to get most feedback teachers" });
  }
});

router.get("/leaderboard/most-improved", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const topTeachers = await storage.getMostImprovedTeachers(limit);
    res.json(topTeachers);
  } catch (error) {
    console.error("Get most improved teachers error:", error);
    res.status(500).json({ error: "Failed to get most improved teachers" });
  }
});

// Admin Moderation / SLA Monitoring
router.get("/admin/doubts/overdue", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const days = parseInt(req.query.days as string) || 5;
    const overdue = await storage.getOverdueDoubts(days);
    res.json(overdue);
  } catch (error) {
    console.error("Get overdue doubts error:", error);
    res.status(500).json({ error: "Failed to get overdue doubts" });
  }
});

router.get("/admin/feedback/flagged", authenticateToken, requireRole("admin"), async (_req: AuthRequest, res) => {
  try {
    const flagged = await storage.getFeedbackFlagsDetailed();
    res.json(flagged);
  } catch (error) {
    console.error("Get flagged feedback error:", error);
    res.status(500).json({ error: "Failed to get flagged feedback" });
  }
});

router.delete("/admin/feedback/:id", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
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
router.get("/activity/recent", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const activity = await storage.getRecentActivity(limit);
    res.json(activity);
  } catch (error) {
    console.error("Get recent activity error:", error);
    res.status(500).json({ error: "Failed to get recent activity" });
  }
});

// Student Gamification
router.get("/student/gamification", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    const stats = await storage.getStudentGamification(req.user!.id);
    res.json(stats);
  } catch (error) {
    console.error("Get student gamification error:", error);
    res.status(500).json({ error: "Failed to load gamification stats" });
  }
});

router.post("/student/achievements/:achievementId/claim", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    const result = await storage.claimStudentAchievement(req.user!.id, req.params.achievementId);
    res.json(result);
  } catch (error) {
    console.error("Claim achievement error:", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to claim achievement" });
  }
});

// Predictive Student Performance
router.post("/performance/predict", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const studentId = req.user!.role === "student" ? req.user!.id : (req.body.studentId || req.user!.id);
    const student = await UserModel.findById(studentId).lean();
    if (!student) return res.status(404).json({ error: "Student not found" });

    const attendanceRecords = await AttendanceRecordModel.find({ studentId }).lean();
    const totalSessions = await AttendanceSessionModel.countDocuments({ status: "closed" });
    const attendancePercent = totalSessions > 0 ? Math.round((attendanceRecords.length / totalSessions) * 100) : 75;

    const quizAttempts = await QuizAttemptModel.find({ studentId }).lean();
    const quizAverage = quizAttempts.length > 0
      ? Math.round(quizAttempts.reduce((sum, a: any) => sum + (a.percentage || 0), 0) / quizAttempts.length)
      : 50;

    const feedbacks = await FeedbackModel.find({ studentId }).lean();
    const feedbackCount = feedbacks.length;

    const engagementScore = Math.min(100, Math.round(
      (attendancePercent * 0.3) + (quizAverage * 0.3) + (Math.min(feedbackCount * 10, 40))
    ));

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
      { upsert: true, new: true }
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

router.get("/performance/my", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
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

router.get("/performance/all", authenticateToken, requireRole("teacher", "admin"), async (_req: AuthRequest, res) => {
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

router.post("/admin/departments/rename", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const { oldName, newName } = req.body;
    if (!oldName || !newName) {
      return res.status(400).json({ error: "oldName and newName are required" });
    }

    const trimmedOld = oldName.trim();
    const trimmedNew = newName.trim();

    // Update teachers
    const teacherResult = await TeacherModel.updateMany(
      { department: trimmedOld },
      { $set: { department: trimmedNew } }
    );

    // Update users
    const userResult = await UserModel.updateMany(
      { department: trimmedOld },
      { $set: { department: trimmedNew } }
    );

    res.json({
      success: true,
      message: `Successfully renamed department from "${trimmedOld}" to "${trimmedNew}"`,
      teachersUpdated: teacherResult.modifiedCount,
      usersUpdated: userResult.modifiedCount
    });
  } catch (error: any) {
    console.error("Rename department error:", error);
    res.status(500).json({ error: error?.message || "Failed to rename department" });
  }
});

router.get("/admin/audit-logs", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(100, parsePositiveInt(req.query.limit, 20));
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const role = typeof req.query.role === "string" ? req.query.role.trim() : "all";
    const action = typeof req.query.action === "string" ? req.query.action.trim() : "all";

    const query: any = {};

    if (search) {
      const safe = escapeRegex(search);
      query.$or = [
        { userName: { $regex: safe, $options: "i" } },
        { action: { $regex: safe, $options: "i" } },
        { detail: { $regex: safe, $options: "i" } },
      ];
    }

    if (role && role !== "all") {
      query.userRole = role;
    }

    if (action && action !== "all") {
      query.action = action;
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLogModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLogModel.countDocuments(query),
    ]);

    const parsedLogs = logs.map((log: any) => ({
      id: log._id.toString(),
      userId: log.userId,
      userName: log.userName,
      userRole: log.userRole,
      action: log.action,
      target: log.target,
      targetId: log.targetId,
      detail: log.detail,
      ip: log.ip,
      createdAt: log.createdAt,
    }));

    res.json({
      items: parsedLogs,
      total,
      page,
      limit
    });
  } catch (error) {
    console.error("Get audit logs error:", error);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

export default router;
