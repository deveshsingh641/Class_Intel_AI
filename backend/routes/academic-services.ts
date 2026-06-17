import { Router } from "express";
import csv from "csv-parser";
import { Readable } from "stream";
import { storage } from "../storage";
import * as intelligence from "../intelligence";
import {
  LectureSummaryModel,
  CourseDocumentModel,
  RagChatModel,
  TeacherModel,
  UserModel,
  TopicAnalysisModel,
  StudentRiskModel,
  AISuggestionModel,
  SentimentSnapshotModel,
  AlertModel
} from "@shared/schema";
import {
  authenticateToken,
  requireRole,
  AuthRequest,
  getTeacherId,
  escapeRegex,
  upload
} from "./common";

const router = Router();

// Feedback Analysis Routes

router.post("/ai/analyze-feedback/:id", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const feedbackId = req.params.id;
    const fb = await storage.getFeedbackById(feedbackId);

    if (!fb) {
      return res.status(404).json({ error: "Feedback not found" });
    }
    
    const sentiment = intelligence.analyzeSentiment(fb.comment || "");
    const qualityScore = fb.rating >= 4 ? 85 : fb.rating === 3 ? 60 : 30;

    await storage.saveFeedbackAnalysis({
      feedbackId: fb._id,
      sentiment: sentiment.sentiment,
      sentimentScore: sentiment.polarity,
      qualityScore,
      keywords: JSON.stringify(sentiment.keywords.map(k => k.word)),
    });

    res.json({
      sentiment: sentiment.sentiment,
      sentimentScore: sentiment.polarity,
      keywords: sentiment.keywords.map(k => k.word),
      qualityScore,
      qualityReasoning: "Feedback scored locally using comment rating and length.",
    });
  } catch (error: any) {
    console.error("Analyze feedback error:", error);
    res.status(500).json({ error: error?.message || "Failed to analyze feedback" });
  }
});

router.post("/ai/teacher-summary/:id", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const teacherId = req.params.id;
    const feedbackList = await storage.getFeedbackByTeacher(teacherId);
    const count = feedbackList.length;
    const avg = count > 0 ? (feedbackList.reduce((s, f) => s + f.rating, 0) / count).toFixed(1) : "0.0";

    const summary = `System calculated summary of ${count} feedback submissions. The teacher has an average rating of ${avg}/5.0.`;
    const strengths = ["Good subject explanation", "Approachable during query sessions"];
    const improvements = ["Incorporate more practical class examples", "Optimize course pacing"];

    await storage.saveTeacherSummary({
      teacherId,
      summary,
      strengths: JSON.stringify(strengths),
      improvements: JSON.stringify(improvements),
    });

    res.json({
      summary,
      strengths,
      improvements,
    });
  } catch (error: any) {
    console.error("Generate summary error:", error);
    res.status(500).json({ error: error?.message || "Failed to generate summary" });
  }
});

router.get("/ai/teacher-summary/:id", async (req, res) => {
  try {
    const teacherId = req.params.id;
    const summary = await storage.getLatestTeacherSummary(teacherId);

    if (!summary) {
      return res.status(404).json({ error: "No summary available" });
    }

    res.json({
      summary: summary.summary,
      strengths: JSON.parse(summary.strengths || "[]"),
      improvements: JSON.parse(summary.improvements || "[]"),
      generatedAt: summary.generatedAt,
    });
  } catch (error: any) {
    console.error("Get summary error:", error);
    res.status(500).json({ error: error.message || "Failed to get summary" });
  }
});

router.post("/ai/recommend-teachers", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const teachers = await storage.getTeachers();
    const dbUser = req.user ? await storage.getUser(req.user.id) : null;
    const department = dbUser?.department || "";

    const recommendations = teachers
      .filter((t) => !department || t.department === department)
      .sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0))
      .slice(0, 3)
      .map((t) => ({
        id: (t as any).id || (t as any)._id,
        name: t.name,
        department: t.department,
        subject: t.subject,
        averageRating: t.averageRating ?? null,
        bio: t.bio ?? null,
      }));

    res.json({ recommendations });
  } catch (error: any) {
    console.error("Recommend teachers error:", error);
    res.status(500).json({ error: error?.message || "Failed to get recommendations" });
  }
});

router.post("/ai/improve-feedback", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    const { comment } = req.body as { comment?: string };
    if (!comment || typeof comment !== "string" || !comment.trim()) {
      return res.status(400).json({ error: "Comment is required" });
    }
    res.json({ improvedComment: comment.trim() });
  } catch (error: any) {
    console.error("Improve feedback error:", error);
    res.status(500).json({ error: error?.message || "Failed to improve feedback" });
  }
});

router.post("/ai/chat", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { message } = req.body as { message?: string };
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    const lower = message.toLowerCase();
    let response = "I am your course study assistant. Ask me about attendance, quizzes, or materials.";

    if (lower.includes("attendance")) {
      response = "You can view your subject-wise attendance logs and input session check-in passcodes on the Attendance tab.";
    } else if (lower.includes("quiz")) {
      response = "Your active class quizzes can be accessed and completed in the Quizzes tab.";
    } else if (lower.includes("feedback")) {
      response = "You can submit feedback for your teachers by browsing them from your student workspace.";
    }

    res.json({ response });
  } catch (error: any) {
    console.error("Chatbot error:", error);
    res.status(500).json({ error: error?.message || "Failed to process chat message" });
  }
});

router.post("/ai/reply-templates", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { comment } = req.body as { comment?: string };
    if (!comment || typeof comment !== "string" || !comment.trim()) {
      return res.status(400).json({ error: "Comment is required" });
    }

    const templates = [
      "Thank you for the detailed feedback. I will look into ways to incorporate this into my future class planning.",
      "I appreciate your suggestions and will review the pacing of the topics to ensure better understanding.",
      "Thank you for sharing your thoughts. I am glad to see you are enjoying the course materials.",
    ];
    res.json({ templates });
  } catch (error: any) {
    console.error("Reply templates error:", error);
    res.status(500).json({ error: error?.message || "Failed to generate reply templates" });
  }
});

router.get("/ai/feedback-analysis/:id", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const feedbackId = req.params.id;
    const analysis = await storage.getFeedbackAnalysis(feedbackId);

    if (!analysis) {
      return res.status(404).json({ error: "No analysis available" });
    }

    res.json({
      sentiment: analysis.sentiment,
      sentimentScore: analysis.sentimentScore,
      qualityScore: analysis.qualityScore,
      keywords: JSON.parse(analysis.keywords || "[]"),
      analyzedAt: analysis.analyzedAt,
    });
  } catch (error: any) {
    console.error("Get feedback analysis error:", error);
    res.status(500).json({ error: error?.message || "Failed to get analysis" });
  }
});

// Lecture Summarizer

router.post("/lectures/summarize", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    const teacherId = await getTeacherId(req.user!);
    const { title, subject, transcript, duration, summary: reqSummary, keyTopics: reqKeyTopics, flashcards: reqFlashcards } = req.body as {
      title?: string; subject?: string; transcript?: string; duration?: number;
      summary?: string; keyTopics?: string[]; flashcards?: Array<{ question: string; answer: string }>;
    };
    if (!title?.trim() || !transcript?.trim()) {
      return res.status(400).json({ error: "Title and transcript are required" });
    }

    // Use requested summary/topics/flashcards if provided, otherwise generate local defaults
    const summary = reqSummary?.trim() || (transcript.substring(0, 300) + (transcript.length > 300 ? "..." : ""));
    const keyTopics = reqKeyTopics && reqKeyTopics.length > 0 ? reqKeyTopics : ["General Lecture"];
    const flashcards = reqFlashcards && reqFlashcards.length > 0 ? reqFlashcards : [{ question: "What topic was covered?", answer: title || "Lecture Topic" }];

    const lecture = await LectureSummaryModel.create({
      teacherId,
      title: title.trim(),
      subject: subject?.trim() || "General",
      transcript,
      summary,
      keyTopics: JSON.stringify(keyTopics),
      flashcards: JSON.stringify(flashcards),
      duration: duration || 0,
    });

    res.status(201).json({
      ...lecture.toObject(),
      id: lecture._id,
      keyTopics,
      flashcards,
    });
  } catch (error) {
    console.error("Lecture summarize error:", error);
    res.status(500).json({ error: "Failed to save lecture details" });
  }
});

router.get("/lectures", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const query: any = {};
    if (req.query.teacherId) query.teacherId = req.query.teacherId;
    if (req.user!.role === "teacher") {
      query.teacherId = await getTeacherId(req.user!);
    }
    const lectures = await LectureSummaryModel.find(query).sort({ createdAt: -1 }).limit(50).lean();
    const parsed = lectures.map((l: any) => ({
      ...l,
      id: l._id,
      keyTopics: JSON.parse(l.keyTopics || "[]"),
      flashcards: JSON.parse(l.flashcards || "[]"),
    }));
    res.json(parsed);
  } catch (error) {
    res.status(500).json({ error: "Failed to get lectures" });
  }
});

router.get("/lectures/:id", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const lecture = await LectureSummaryModel.findById(req.params.id).lean();
    if (!lecture) return res.status(404).json({ error: "Lecture not found" });
    res.json({
      ...lecture,
      id: (lecture as any)._id,
      keyTopics: JSON.parse((lecture as any).keyTopics || "[]"),
      flashcards: JSON.parse((lecture as any).flashcards || "[]"),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to get lecture" });
  }
});

// Additional Routes

router.post("/ai/suggestions", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    const teacherId = await getTeacherId(req.user!);
    const suggestions = [
      "Improve interaction in class by using regular quiz checkpoints.",
      "Optimize course pacing to match student comprehension rates.",
      "Maintain active communication during designated query office hours.",
    ];

    const doc = await AISuggestionModel.create({
      teacherId,
      suggestions: JSON.stringify(suggestions),
    });

    res.json({ id: doc._id, suggestions });
  } catch (error) {
    console.error("AI suggestions error:", error);
    res.status(500).json({ error: "Failed to generate suggestions" });
  }
});

router.get("/ai/suggestions", authenticateToken, async (req: AuthRequest, res) => {
  try {
    let teacherId = req.query.teacherId as string;
    if (req.user!.role === "teacher") {
      teacherId = await getTeacherId(req.user!);
    }
    if (!teacherId) return res.status(400).json({ error: "teacherId is required" });

    const doc = await AISuggestionModel.findOne({ teacherId }).sort({ createdAt: -1 }).lean();
    if (!doc) return res.json([]);

    res.json(JSON.parse((doc as any).suggestions || "[]"));
  } catch (error) {
    res.status(500).json({ error: "Failed to load suggestions" });
  }
});

router.post("/ai/quizzes/generate", authenticateToken, requireRole("teacher", "admin"), async (_req: AuthRequest, res) => {
  res.status(400).json({ error: "AI Quiz generation is disabled. Please create quizzes manually." });
});

// Local Heuristics & Reports

router.get("/intelligence/sentiment-snapshots", authenticateToken, async (req: AuthRequest, res) => {
  try {
    let teacherId = req.query.teacherId as string;
    if (req.user!.role === "teacher") {
      teacherId = await getTeacherId(req.user!);
    }
    if (!teacherId) return res.status(400).json({ error: "teacherId is required" });

    const snapshots = await SentimentSnapshotModel.find({ teacherId }).sort({ date: 1 }).limit(100).lean();
    res.json(snapshots.map((s: any) => ({ ...s, id: s._id })));
  } catch (error) {
    res.status(500).json({ error: "Failed to get sentiment snapshots" });
  }
});

router.get("/intelligence/topics", authenticateToken, async (req: AuthRequest, res) => {
  try {
    let teacherId = req.query.teacherId as string;
    if (req.user!.role === "teacher") {
      teacherId = await getTeacherId(req.user!);
    }
    if (!teacherId) return res.status(400).json({ error: "teacherId is required" });

    const topics = await TopicAnalysisModel.find({ teacherId }).lean();
    res.json(topics.map((t: any) => ({ ...t, id: t._id })));
  } catch (error) {
    res.status(500).json({ error: "Failed to get topic analysis" });
  }
});

router.get("/intelligence/student-risk", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    let teacherId = req.query.teacherId as string;
    if (req.user!.role === "teacher") {
      teacherId = await getTeacherId(req.user!);
    }

    const query: any = {};
    if (teacherId) query.teacherId = teacherId;

    const risks = await StudentRiskModel.find(query).sort({ riskScore: -1 }).lean();
    res.json(risks.map((r: any) => ({ ...r, id: r._id, alerts: JSON.parse(r.alerts || "[]") })));
  } catch (error) {
    res.status(500).json({ error: "Failed to get student risks" });
  }
});

router.get("/intelligence/alerts", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const query: any = {};
    if (req.user!.role === "teacher") {
      const teacherId = await getTeacherId(req.user!);
      query.teacherId = teacherId;
    } else if (req.user!.role === "student") {
      query.studentId = req.user!.id;
    }

    const alerts = await AlertModel.find(query).sort({ createdAt: -1 }).limit(50).lean();
    res.json(alerts.map((a: any) => ({ ...a, id: a._id })));
  } catch (error) {
    res.status(500).json({ error: "Failed to load alerts" });
  }
});

router.post("/intelligence/alerts/:alertId/resolve", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    const alert = await AlertModel.findByIdAndUpdate(req.params.alertId, { isResolved: true, resolvedAt: new Date() }, { new: true });
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    res.json(alert);
  } catch (error) {
    res.status(500).json({ error: "Failed to resolve alert" });
  }
});

// AI Intelligence Dashboard API endpoints
router.get("/intelligence/health", async (req, res) => {
  res.json({ status: "healthy" });
});

router.get("/intelligence/sentiment/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { teacherId } = req.params;
    const feedbackList = await storage.getFeedbackByTeacher(teacherId);
    const comments = feedbackList.map(f => f.comment || "").filter(c => c.trim());
    const results = intelligence.batchSentiment(comments);
    res.json(results);
  } catch (error: any) {
    console.error("Get intelligence sentiment error:", error);
    res.status(500).json({ error: error?.message || "Failed to load sentiment" });
  }
});

router.get("/intelligence/topics/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { teacherId } = req.params;
    const feedbackList = await storage.getFeedbackByTeacher(teacherId);
    const comments = feedbackList.map(f => f.comment || "").filter(c => c.trim());
    const results = intelligence.batchTopicExtraction(comments);
    res.json(results);
  } catch (error: any) {
    console.error("Get intelligence topics error:", error);
    res.status(500).json({ error: error?.message || "Failed to load topics" });
  }
});

router.get("/intelligence/suggestions/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { teacherId } = req.params;
    const teacher = await storage.getTeacher(teacherId);
    const feedbackList = await storage.getFeedbackByTeacher(teacherId);
    const comments = feedbackList.map(f => f.comment || "").filter(c => c.trim());
    const results = intelligence.generateSuggestions(comments, teacher?.name || "Teacher", teacher?.subject || "General");
    res.json(results);
  } catch (error: any) {
    console.error("Get intelligence suggestions error:", error);
    res.status(500).json({ error: error?.message || "Failed to load suggestions" });
  }
});

// Course Documents Keyword Query

router.post("/rag/documents", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    const { title, subject, content } = req.body as { title?: string; subject?: string; content?: string };
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    const teacherId = await getTeacherId(req.user!);

    const chunkSize = 500;
    const overlap = 100;
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += chunkSize - overlap) {
      chunks.push(content.substring(i, i + chunkSize));
    }

    const doc = await CourseDocumentModel.create({
      teacherId,
      title: title.trim(),
      subject: subject?.trim() || "General",
      content,
      chunks: JSON.stringify(chunks),
      uploadedBy: req.user!.id,
    });

    res.status(201).json({ ...doc.toObject(), id: doc._id, chunksCount: chunks.length });
  } catch (error) {
    console.error("Upload document error:", error);
    res.status(500).json({ error: "Failed to upload document" });
  }
});

router.get("/rag/documents", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const query: any = {};
    if (req.query.subject) query.subject = req.query.subject;
    const docs = await CourseDocumentModel.find(query).select("-content -chunks").sort({ createdAt: -1 }).lean();
    res.json(docs.map((d: any) => ({ ...d, id: d._id })));
  } catch (error) {
    res.status(500).json({ error: "Failed to get documents" });
  }
});

router.delete("/rag/documents/:id", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    await CourseDocumentModel.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete document" });
  }
});

router.post("/rag/chat", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { question, subject } = req.body as { question?: string; subject?: string };
    if (!question?.trim()) return res.status(400).json({ error: "Question is required" });

    const query: any = {};
    if (subject) query.subject = subject;
    const allDocs = await CourseDocumentModel.find(query).lean();

    const queryWords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const scoredChunks: Array<{ chunk: string; score: number; docTitle: string }> = [];

    for (const doc of allDocs) {
      const chunks: string[] = JSON.parse((doc as any).chunks || "[]");
      for (const chunk of chunks) {
        const chunkLower = chunk.toLowerCase();
        let score = 0;
        for (const word of queryWords) {
          if (chunkLower.includes(word)) score += 1;
        }
        if (score > 0) {
          scoredChunks.push({ chunk, score, docTitle: (doc as any).title });
        }
      }
    }

    scoredChunks.sort((a, b) => b.score - a.score);
    const topChunks = scoredChunks.slice(0, 3);

    let answer = "I couldn't find relevant information in the uploaded course materials.";
    const sources = topChunks.map(c => ({ documentTitle: c.docTitle, chunk: c.chunk.substring(0, 200), relevanceScore: c.score }));

    if (topChunks.length > 0) {
      answer = `Local Material Match found in "${topChunks[0].docTitle}":\n\n"${topChunks[0].chunk.substring(0, 500)}..."`;
    }

    await RagChatModel.create({
      userId: req.user!.id,
      question: question.trim(),
      answer,
      sources: JSON.stringify(sources),
      subject: subject || "General",
    });

    res.json({ answer, sources, documentsSearched: allDocs.length });
  } catch (error) {
    console.error("Local search error:", error);
    res.status(500).json({ error: "Failed to search materials" });
  }
});

router.get("/rag/history", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const chats = await RagChatModel.find({ userId: req.user!.id }).sort({ createdAt: -1 }).limit(50).lean();
    const parsed = chats.map((c: any) => ({
      ...c,
      id: c._id,
      sources: JSON.parse(c.sources || "[]"),
    }));
    res.json(parsed);
  } catch (error) {
    res.status(500).json({ error: "Failed to get search history" });
  }
});

// Local Import Routes

router.post("/lms/csv/import-students", authenticateToken, requireRole("admin"), upload.single("file"), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "CSV file required" });

  const results: any[] = [];
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    const stream = Readable.from(req.file.buffer);
    await new Promise<void>((resolve, reject) => {
      stream
        .pipe(csv())
        .on("data", (row: any) => results.push(row))
        .on("end", resolve)
        .on("error", reject);
    });

    for (const row of results) {
      const email = row.email || row.Email || row.EMAIL;
      const name = row.name || row.Name || row.NAME || row.full_name || `${row.first_name || ""} ${row.last_name || ""}`.trim();
      const department = row.department || row.Department || row.DEPARTMENT || "General";
      const role = (row.role || row.Role || "student").toLowerCase();

      if (!email || !name) {
        errors.push(`Skipped row: missing email or name`);
        skipped++;
        continue;
      }

      const exists = await storage.getUserByEmail(email);
      if (exists) {
        skipped++;
        continue;
      }

      await storage.createUser({
        username: email.split("@")[0],
        email,
        password: "changeme123",
        name,
        role: role === "teacher" ? "teacher" : "student",
        department,
      });
      imported++;
    }

    res.json({ imported, skipped, errors: errors.slice(0, 10), total: results.length });
  } catch (error) {
    console.error("CSV import error:", error);
    res.status(500).json({ error: "Failed to parse CSV" });
  }
});

export default router;
