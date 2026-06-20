import { Router } from "express";
import { storage } from "../storage";
import {
  PasscodeRegistrationModel,
  AttendanceSessionModel,
  AttendanceRecordModel,
  UserModel
} from "@shared/schema";
import {
  authenticateToken,
  requireRole,
  AuthRequest,
  getTeacherId
} from "./common";

const router = Router();

router.post("/attendance/register-passcode", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { passcode } = req.body;
    if (!passcode || typeof passcode !== "string" || passcode.trim().length === 0) {
      return res.status(400).json({ error: "Passcode is required" });
    }

    const reg = await PasscodeRegistrationModel.findOneAndUpdate(
      { userId: req.user!.id },
      { userId: req.user!.id, passcode: passcode.trim(), updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, registration: reg });
  } catch (error) {
    console.error("Register passcode error:", error);
    res.status(500).json({ error: "Failed to register passcode" });
  }
});

router.get("/attendance/passcode-status", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const reg = await PasscodeRegistrationModel.findOne({ userId: req.user!.id }).lean();
    res.json({ registered: !!reg });
  } catch (error) {
    res.status(500).json({ error: "Failed to get passcode status" });
  }
});

router.post("/attendance/sessions", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    const teacherId = await getTeacherId(req.user!);
    const { subject, durationMinutes } = req.body as { subject?: string; durationMinutes?: number };
    if (!subject?.trim()) return res.status(400).json({ error: "Subject is required" });

    // Generate a random 6-digit passcode for checking in
    const sessionCode = Math.floor(100000 + Math.random() * 900000).toString();

    const session = await AttendanceSessionModel.create({
      teacherId,
      teacherName: req.user!.name,
      subject: subject.trim(),
      date: new Date(),
      startTime: new Date(),
      durationMinutes: durationMinutes || 60,
      code: sessionCode,
      status: "active",
    });
    res.status(201).json({ ...session.toObject(), id: session._id });
  } catch (error) {
    console.error("Create session error:", error);
    res.status(500).json({ error: "Failed to create session" });
  }
});

router.patch("/attendance/sessions/:sessionId/close", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    const session = await AttendanceSessionModel.findByIdAndUpdate(
      req.params.sessionId,
      { status: "closed" },
      { new: true }
    );
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: "Failed to close session" });
  }
});

router.get("/attendance/sessions", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const query: any = {};
    if (req.user!.role === "teacher") {
      query.teacherId = await getTeacherId(req.user!);
    }
    const sessions = await AttendanceSessionModel.find(query).sort({ date: -1 }).limit(50).lean();
    res.json(sessions.map((s: any) => ({ ...s, id: s._id })));
  } catch (error) {
    res.status(500).json({ error: "Failed to list sessions" });
  }
});

router.post("/attendance/mark", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { sessionId, code } = req.body as { sessionId?: string; code?: string };
    if (!sessionId) return res.status(400).json({ error: "sessionId is required" });
    if (!code) return res.status(400).json({ error: "Verification code is required" });

    const session = await AttendanceSessionModel.findById(sessionId).lean();
    if (!session) return res.status(404).json({ error: "Session not found" });
    if ((session as any).status !== "active") return res.status(400).json({ error: "Session is closed" });

    if ((session as any).code !== code.trim()) {
      return res.status(400).json({ error: "Invalid check-in code" });
    }

    const existing = await AttendanceRecordModel.findOne({ sessionId, studentId: req.user!.id }).lean();
    if (existing) return res.status(400).json({ error: "Attendance already marked" });

    const record = await AttendanceRecordModel.create({
      sessionId,
      studentId: req.user!.id,
      studentName: req.user!.name,
      markedAt: new Date(),
      method: "passcode",
      isProxy: false,
    });
    res.status(201).json({ ...record.toObject(), id: record._id });
  } catch (error: any) {
    if (error?.code === 11000) return res.status(400).json({ error: "Attendance already marked" });
    console.error("Mark attendance error:", error);
    res.status(500).json({ error: "Failed to mark attendance" });
  }
});

router.get("/attendance/sessions/:sessionId/records", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const records = await AttendanceRecordModel.find({ sessionId: req.params.sessionId }).sort({ markedAt: 1 }).lean();
    res.json(records.map((r: any) => ({ ...r, id: r._id })));
  } catch (error) {
    res.status(500).json({ error: "Failed to get records" });
  }
});

router.get("/attendance/my-summary", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    const records = await AttendanceRecordModel.find({ studentId: req.user!.id }).lean();
    const attended = records.length;
    const allSessions = await AttendanceSessionModel.find({}).lean();
    const attendedSessionIds = records.map((r: any) => r.sessionId.toString());

    // Build a map of sessions to subject names
    const sessionToSubject = new Map<string, string>();
    for (const session of allSessions) {
      sessionToSubject.set(session._id.toString(), (session as any).subject || "Unknown");
    }

    // Determine the subjects the student has attended at least once
    const attendedSubjects = new Set<string>();
    for (const rec of records) {
      const subj = sessionToSubject.get(rec.sessionId.toString()) || "Unknown";
      attendedSubjects.add(subj);
    }

    // Filter sessions to only those matching the student's attended subjects
    const relevantSessions = allSessions.filter((session) => {
      const subj = (session as any).subject || "Unknown";
      return attendedSubjects.size === 0 || attendedSubjects.has(subj);
    });

    const total = relevantSessions.length;
    const percentage = total > 0 ? Math.round((attended / total) * 100) : 100;

    const subjectMap = new Map<string, { total: number; attended: number }>();
    for (const session of relevantSessions) {
      const subj = (session as any).subject || "Unknown";
      if (!subjectMap.has(subj)) subjectMap.set(subj, { total: 0, attended: 0 });
      subjectMap.get(subj)!.total++;
      if (attendedSessionIds.includes((session as any)._id.toString())) {
        subjectMap.get(subj)!.attended++;
      }
    }

    const subjects = Array.from(subjectMap.entries()).map(([subject, data]) => ({
      subject,
      totalClasses: data.total,
      attended: data.attended,
      percentage: data.total > 0 ? Math.round((data.attended / data.total) * 100) : 0,
    }));

    res.json({ attended, total, percentage, subjects, records: records.map((r: any) => ({ ...r, id: r._id })) });
  } catch (error) {
    console.error("Attendance summary error:", error);
    res.status(500).json({ error: "Failed to get attendance summary" });
  }
});

export default router;
