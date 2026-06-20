import { Router } from "express";
import csv from "csv-parser";
import { Readable } from "stream";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require("pdf-parse");
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
  AlertModel,
  ActionItemModel,
  WeeklyDigestModel
} from "@shared/schema";
import {
  authenticateToken,
  requireRole,
  AuthRequest,
  getTeacherId,
  escapeRegex,
  upload,
  ABUSIVE_WORDS
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
    const commentLen = (fb.comment || "").length;
    const qualityScore = Math.min(5, Math.max(1, Math.round((commentLen / 50) + fb.rating / 2)));

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

router.post("/ai/detect-toxic", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { text } = req.body as { text?: string };
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Text is required" });
    }

    const lower = text.toLowerCase();
    const matchedWords = ABUSIVE_WORDS.filter(w => lower.includes(w));
    const isToxic = matchedWords.length > 0;

    res.json({
      isToxic,
      confidence: isToxic ? 0.98 : 0.99,
      reason: isToxic
        ? `Feedback contains potentially inappropriate language: "${matchedWords.join(", ")}".`
        : "Text verified clean.",
      categories: isToxic ? ["toxic", "insult"] : [],
    });
  } catch (error: any) {
    console.error("Toxic detection error:", error);
    res.status(500).json({ error: error?.message || "Failed to detect toxicity" });
  }
});

router.post("/ai/teacher-summary/:id", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const teacherId = req.params.id;
    const teacher = await storage.getTeacher(teacherId);
    const feedbackList = await storage.getFeedbackByTeacher(teacherId);
    const count = feedbackList.length;
    const avg = count > 0 ? (feedbackList.reduce((s, f) => s + f.rating, 0) / count).toFixed(1) : "0.0";

    const comments = feedbackList.map(f => f.comment || "").filter(c => c.trim());

    let summary = `System calculated summary of ${count} feedback submissions. The teacher has an average rating of ${avg}/5.0.`;
    let strengths = ["Good subject explanation", "Approachable during query sessions"];
    let improvements = ["Incorporate more practical class examples", "Optimize course pacing"];

    if (comments.length > 0) {
      const sentiment = intelligence.batchSentiment(comments);
      const topics = intelligence.batchTopicExtraction(comments);

      const topicLabels: Record<string, string> = {
        pace: "Teaching Pace",
        clarity: "Clarity & Explanation",
        examples: "Practical Examples",
        engagement: "Student Engagement",
        content: "Course Content",
        assessment: "Assessment & Grading",
        communication: "Communication",
        resources: "Learning Resources",
        support: "Student Support",
        organization: "Organization & Preparation"
      };

      const suggestions = intelligence.generateSuggestions(comments, teacher?.name || "Teacher", teacher?.subject || "General");
      summary = suggestions.summary;

      // Group feedback comments by topic and check the average rating for feedback items mentioning each topic.
      const topicStats: Record<string, { sum: number; count: number }> = {};
      for (const f of feedbackList) {
        const comment = f.comment || "";
        if (!comment.trim()) continue;
        const result = intelligence.extractTopics(comment);
        for (const t of result.topics) {
          if (!topicStats[t.topic]) {
            topicStats[t.topic] = { sum: 0, count: 0 };
          }
          topicStats[t.topic].sum += f.rating;
          topicStats[t.topic].count++;
        }
      }

      const extractedStrengths: string[] = [];
      const extractedImprovements: string[] = [];

      for (const [topicKey, stats] of Object.entries(topicStats)) {
        const labelName = topicLabels[topicKey] || topicKey;
        const topicAvg = stats.sum / stats.count;
        if (topicAvg >= 3.5) {
          extractedStrengths.push(labelName);
        } else {
          extractedImprovements.push(labelName);
        }
      }

      if (extractedStrengths.length > 0) strengths = extractedStrengths.slice(0, 3);
      if (extractedImprovements.length > 0) improvements = extractedImprovements.slice(0, 3);
      
      if (strengths.length === 0 && improvements.length > 0) {
        strengths = ["Subject knowledge depth"];
      }
      if (improvements.length === 0 && strengths.length > 0) {
        improvements = ["Maintain active class participation"];
      }
    }

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
    const improvedComment = intelligence.polishFeedback(comment);
    res.json({ improvedComment });
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

    if (intelligence.isDoubtOrQuestion(comment)) {
      const templates = intelligence.generateDoubtReplies(comment);
      return res.json({ templates });
    }

    const sentiment = intelligence.analyzeSentiment(comment);
    let templates = [
      "Thank you for the detailed feedback. I will look into ways to incorporate this into my future class planning.",
      "I appreciate your suggestions and will review the pacing of the topics to ensure better understanding.",
      "Thank you for sharing your thoughts. I am glad to see you are enjoying the course materials.",
    ];

    if (sentiment.sentiment === "positive") {
      templates = [
        "Thank you so much for the encouraging feedback! I am glad you are finding the lectures engaging.",
        "I really appreciate the kind words. I will continue to provide structured class sessions and support.",
        "Thank you for sharing. I'm happy to hear that the teaching style and resources are working well for you."
      ];
    } else if (sentiment.sentiment === "negative") {
      templates = [
        "Thank you for the constructive feedback. I will look closely at these areas to improve the classroom pace and clarity.",
        "I appreciate your suggestions and will work on incorporating more real-world examples and practical exercises.",
        "Thank you for pointing this out. I will review the lecture structure and ensure doubts are addressed promptly."
      ];
    }

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

// AI Insights, Weekly Digest, Action Items, and Doubt Auto-Answer endpoints

router.post("/ai/categorize-feedback/:feedbackId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const feedback = await storage.getFeedbackById(req.params.feedbackId);
    if (!feedback) return res.status(404).json({ error: "Feedback not found" });

    const result = intelligence.extractTopics(feedback.comment || "");
    const categories = result.topics.map(t => t.topic);
    if (categories.length === 0) categories.push("general");

    res.json({
      categories,
      primaryCategory: categories[0],
      confidence: 0.95,
    });
  } catch (error: any) {
    console.error("Categorize feedback error:", error);
    res.status(500).json({ error: "Failed to categorize feedback" });
  }
});

router.post("/ai/auto-answer-doubt", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { question, teacherId } = req.body as { question?: string; teacherId?: string };
    if (!question?.trim()) return res.status(400).json({ error: "Question is required" });

    const lower = question.toLowerCase();
    let answer = "This doubt has been posted to the teacher's doubt wall. They will review it and reply soon.";

    const query: any = {};
    if (teacherId) {
      const teacher = await storage.getTeacher(teacherId);
      if (teacher) {
        query.subject = teacher.subject;
      } else {
        query.teacherId = teacherId;
      }
    }

    const docs = await CourseDocumentModel.find(query).lean();
    if (docs.length > 0) {
      const queryWords = lower.split(/\s+/).filter(w => w.length > 3);
      let bestChunk = "";
      let bestScore = 0;
      let docTitle = "";

      for (const doc of docs) {
        const chunks = JSON.parse((doc as any).chunks || "[]");
        for (const chunk of chunks) {
          const chunkLower = chunk.toLowerCase();
          let score = 0;
          for (const word of queryWords) {
            if (chunkLower.includes(word)) score++;
          }
          if (score > bestScore) {
            bestScore = score;
            bestChunk = chunk;
            docTitle = (doc as any).title;
          }
        }
      }

      if (bestScore > 0) {
        answer = `**Auto-Answer from Course Material ("${docTitle}")**:\n\n${bestChunk.substring(0, 400)}...`;
      }
    }

    if (!answer.includes("Auto-Answer")) {
      if (lower.includes("mongodb") || lower.includes("mongoose") || lower.includes("schema")) {
        answer = "**MongoDB & Mongoose Guide**:\n\nMongoDB is a document database storing data in flexible JSON-like documents (BSON). Mongoose is an ODM (Object Data Modeling) library for MongoDB and Node.js. It manages relationships between data, provides schema validation, and is used to translate between code objects and database documents.";
      } else if (lower.includes("sql") || lower.includes("relational") || lower.includes("table")) {
        answer = "**SQL vs NoSQL**:\n\nSQL databases are relational, table-based, and use structured query language with predefined schemas. NoSQL databases (like MongoDB) are non-relational, document-based, and scale horizontally by adding more servers instead of upgrading hardware.";
      } else if (lower.includes("index") || lower.includes("performance") || lower.includes("search")) {
        answer = "**Indexing & Search**:\n\nIndexes support the efficient execution of queries in MongoDB. Without indexes, MongoDB must perform a collection scan (scan every document in a collection) to select those documents matching the query statement. You can create text indexes for fast keyword search.";
      }
    }

    res.json({ answer, isAiGenerated: true });
  } catch (error: any) {
    console.error("Auto answer doubt error:", error);
    res.status(500).json({ error: error?.message || "Failed to process doubt auto-answer" });
  }
});

router.get("/ai/weekly-digest/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { teacherId } = req.params;
    const digest = await WeeklyDigestModel.findOne({ teacherId }).sort({ generatedAt: -1 }).lean();
    if (!digest) return res.status(404).json({ error: "No digest found" });

    res.json({
      ...digest,
      id: digest._id,
      topStrengths: JSON.parse((digest as any).topStrengths || "[]"),
      focusAreas: JSON.parse((digest as any).focusAreas || "[]"),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load digest" });
  }
});

router.post("/ai/weekly-digest/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { teacherId } = req.params;
    const teacher = await storage.getTeacher(teacherId);
    const feedbackList = await storage.getFeedbackByTeacher(teacherId);
    const comments = feedbackList.map(f => f.comment || "").filter(c => c.trim());

    const sentiment = intelligence.batchSentiment(comments);
    const topics = intelligence.batchTopicExtraction(comments);

    const headline = feedbackList.length > 0 
      ? `Performance summary: rating holds steady at ${(feedbackList.reduce((s,f)=>s+f.rating, 0) / feedbackList.length).toFixed(1)}/5.0`
      : "No feedback gathered yet this week";
    
    const ratingTrend = sentiment.aggregate.avgPolarity > 0.1 
      ? "improving" 
      : sentiment.aggregate.avgPolarity < -0.1 
      ? "declining" 
      : "stable";

    const topStrengths = topics.frequency.slice(0, 2).map(f => `${f.label} (${f.count} mentions)`) || [];
    if (topStrengths.length === 0) topStrengths.push("Good subject knowledge");

    const focusAreas = topics.frequency.slice(2, 4).map(f => `${f.label} (${f.count} mentions)`) || [];
    if (focusAreas.length === 0) focusAreas.push("Pacing class examples");

    const studentEngagement = `${feedbackList.length} student feedback responses processed. Check-ins are active.`;
    const motivationalNote = "Your commitment to teaching clarity is making a positive impact. Keep up the excellent work!";
    const weekSummary = `Analyzed student feedbacks: ${sentiment.aggregate.positivePercent}% positive, ${sentiment.aggregate.negativePercent}% negative. The overall average score remains positive.`;

    const digest = await WeeklyDigestModel.create({
      teacherId,
      headline,
      ratingTrend,
      topStrengths: JSON.stringify(topStrengths),
      focusAreas: JSON.stringify(focusAreas),
      studentEngagement,
      motivationalNote,
      weekSummary,
      weekStartDate: new Date(),
    });

    res.json({
      ...digest.toObject(),
      id: digest._id,
      topStrengths,
      focusAreas,
    });
  } catch (error: any) {
    console.error("Generate weekly digest error:", error);
    res.status(500).json({ error: error?.message || "Failed to generate weekly digest" });
  }
});

router.get("/ai/action-items/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { teacherId } = req.params;
    const items = await ActionItemModel.find({ teacherId }).sort({ generatedAt: -1 }).lean();
    res.json({ items: items.map((i: any) => ({ ...i, id: i._id })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load action items" });
  }
});

router.post("/ai/action-items/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { teacherId } = req.params;
    const feedbackList = await storage.getFeedbackByTeacher(teacherId);
    const comments = feedbackList.map(f => f.comment || "").filter(c => c.trim());

    // Generate local action items based on extracted topics
    const topicsResult = intelligence.batchTopicExtraction(comments);
    
    // Clear old pending items to keep list fresh
    await ActionItemModel.deleteMany({ teacherId, status: "pending" });

    const newItems: any[] = [];
    const suggestionsResult = intelligence.generateSuggestions(comments);

    // Map suggestions to ActionItem schema
    for (const sug of suggestionsResult.suggestions) {
      const item = await ActionItemModel.create({
        teacherId,
        action: sug.suggestion,
        priority: sug.priority,
        category: sug.category === "overall" ? "general" : sug.category,
        basedOn: sug.basedOnTopic,
        status: "pending",
      });
      newItems.push({ ...item.toObject(), id: item._id });
    }

    // Fallback default action items if no feedback is available yet
    if (newItems.length === 0) {
      const fallbacks = [
        { action: "Introduce periodic checkpoints to gauge student understanding.", priority: "medium", category: "engagement", basedOn: "General Setup" },
        { action: "Publish lecture slides and reading references before each class.", priority: "low", category: "resources", basedOn: "General Setup" },
        { action: "Establish regular Office Hours slots for answering doubts.", priority: "high", category: "communication", basedOn: "General Setup" }
      ];
      for (const f of fallbacks) {
        const item = await ActionItemModel.create({
          teacherId,
          action: f.action,
          priority: f.priority,
          category: f.category,
          basedOn: f.basedOn,
          status: "pending",
        });
        newItems.push({ ...item.toObject(), id: item._id });
      }
    }

    res.json({ items: newItems });
  } catch (error: any) {
    console.error("Generate action items error:", error);
    res.status(500).json({ error: error?.message || "Failed to generate action items" });
  }
});

router.patch("/ai/action-items/:itemId/status", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { status } = req.body as { status?: string };
    if (!status) return res.status(400).json({ error: "Status is required" });

    const item = await ActionItemModel.findByIdAndUpdate(req.params.itemId, { status }, { new: true });
    if (!item) return res.status(404).json({ error: "Action item not found" });

    res.json({ ...item.toObject(), id: item._id });
  } catch (error) {
    res.status(500).json({ error: "Failed to update action item status" });
  }
});

router.get("/ai/predict-trend/:teacherId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { teacherId } = req.params;
    const feedbackList = await storage.getFeedbackByTeacher(teacherId);
    
    let predictedRating = 4.2;
    let trend: "improving" | "declining" | "stable" = "stable";
    let confidence = 0.85;
    let reasoning = "No feedback gathered yet to evaluate rating trends. Defaulting to general expectations.";

    if (feedbackList.length > 0) {
      const ratings = feedbackList.map(f => f.rating);
      const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      predictedRating = parseFloat(avg.toFixed(1));

      // Simple prediction logic based on last 3 entries vs all
      const recent = ratings.slice(0, 3);
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      
      if (recentAvg > avg + 0.1) {
        trend = "improving";
        reasoning = `Recent feedback ratings (${recentAvg.toFixed(1)}) show an upward trend compared to the overall average (${avg.toFixed(1)}). Students report strong explanation clarity.`;
      } else if (recentAvg < avg - 0.1) {
        trend = "declining";
        reasoning = `Recent feedback ratings (${recentAvg.toFixed(1)}) show a downward trend compared to the overall average (${avg.toFixed(1)}). Pacing and visual examples should be reviewed.`;
      } else {
        trend = "stable";
        reasoning = `Feedback ratings are stable around ${avg.toFixed(1)}/5.0. Classroom delivery matches expectations.`;
      }
      confidence = Math.min(0.95, 0.6 + feedbackList.length * 0.05);
    }

    res.json({
      predictedRating,
      trend,
      confidence,
      reasoning,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to predict rating trend" });
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

router.get("/intelligence/risk/:teacherId", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    const { teacherId } = req.params;
    const risks = await StudentRiskModel.find({ teacherId }).lean();
    
    const students = risks.map((r: any) => {
      const parsedFactors = JSON.parse(r.factors || "[]");
      const parsedRecs = JSON.parse(r.recommendations || "[]");
      
      const score = r.riskScore ?? 0;
      const level = r.riskLevel || "low";
      const color = level === "high" ? "#ef4444" : level === "medium" ? "#f59e0b" : "#10b981";
      
      return {
        studentName: r.studentName,
        studentId: r.studentId,
        riskLevel: level,
        riskScore: score,
        safetyScore: 100 - score,
        riskColor: color,
        components: {
          attendance: { value: r.attendance ?? 75 },
          marks: { value: r.marks ?? 50 },
          sentiment: { value: r.sentimentPolarity ?? 0 },
          engagement: { value: r.engagementScore ?? 50 },
        },
        factors: parsedFactors,
        recommendations: parsedRecs,
      };
    });

    const total = students.length;
    const high = students.filter(s => s.riskLevel === "high").length;
    const medium = students.filter(s => s.riskLevel === "medium").length;
    const low = students.filter(s => s.riskLevel === "low").length;

    res.json({
      students,
      summary: {
        total,
        highRisk: high,
        mediumRisk: medium,
        lowRisk: low,
        highRiskPercent: total > 0 ? Math.round((high / total) * 100) : 0,
        mediumRiskPercent: total > 0 ? Math.round((medium / total) * 100) : 0,
        lowRiskPercent: total > 0 ? Math.round((low / total) * 100) : 0,
      }
    });
  } catch (error) {
    console.error("Get risk data error:", error);
    res.status(500).json({ error: "Failed to get risk data" });
  }
});

router.post("/intelligence/risk/:teacherId", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    const { teacherId } = req.params;
    const { students } = req.body as { students?: Array<{ name: string; attendance: number; marks: number; engagementScore?: number }> };
    
    if (!Array.isArray(students)) {
      return res.status(400).json({ error: "Students list is required" });
    }

    const saved = [];
    for (const s of students) {
      const attendance = s.attendance ?? 75;
      const marks = s.marks ?? 50;
      const engagement = s.engagementScore ?? 50;

      const riskScore = Math.min(100, Math.max(0, Math.round(
        100 - (attendance * 0.35 + marks * 0.45 + engagement * 0.20)
      )));
      
      const riskLevel = riskScore >= 50 ? "high" : riskScore >= 25 ? "medium" : "low";

      const factors = [];
      if (attendance < 75) {
        factors.push({ factor: "Low Attendance", severity: "high", value: `${attendance}%` });
      }
      if (marks < 60) {
        factors.push({ factor: "Low Marks", severity: marks < 45 ? "high" : "medium", value: `${marks}%` });
      }
      if (engagement < 50) {
        factors.push({ factor: "Low Class Engagement", severity: "medium", value: `${engagement}%` });
      }

      const recommendations = [];
      if (attendance < 75) recommendations.push("Schedule mandatory attendance check-in");
      if (marks < 50) recommendations.push("Provide remedial assignments or extra tutor support");
      if (engagement < 50) recommendations.push("Encourage student to ask questions on doubt wall");
      if (riskLevel === "high") recommendations.push("Flag to academic advisor for intervention");
      if (recommendations.length === 0) recommendations.push("Maintain current performance levels");

      const doc = await StudentRiskModel.findOneAndUpdate(
        { teacherId, studentName: s.name },
        {
          teacherId,
          studentName: s.name,
          riskLevel,
          riskScore,
          attendance,
          marks,
          engagementScore: engagement,
          factors: JSON.stringify(factors),
          recommendations: JSON.stringify(recommendations),
          predictedAt: new Date(),
        },
        { upsert: true, new: true }
      );
      saved.push(doc);
    }

    res.status(201).json({ success: true, count: saved.length });
  } catch (error) {
    console.error("Predict risk error:", error);
    res.status(500).json({ error: "Failed to predict student risk" });
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

// Stopwords to exclude from search scoring
const SEARCH_STOPWORDS = new Set([
  "the", "and", "for", "are", "that", "this", "with", "from", "have",
  "not", "but", "what", "when", "where", "which", "how", "was", "were",
  "been", "being", "their", "there", "they", "will", "would", "could",
  "should", "can", "may", "might", "shall", "does", "did", "has", "had",
  "its", "also", "into", "than", "then", "some", "any", "all", "each",
  "you", "your", "our", "his", "her", "him", "she", "they", "them"
]);

router.post("/rag/documents/parse-file", authenticateToken, requireRole("teacher", "admin"), upload.single("file"), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "File is required" });

    const mime = req.file.mimetype;
    const filename = req.file.originalname || "";
    let extractedText = "";

    if (mime === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
      const parser = new PDFParse({ data: req.file.buffer });
      const result = await parser.getText();
      extractedText = result.text || "";
    } else if (
      mime === "text/plain" ||
      filename.toLowerCase().endsWith(".txt") ||
      filename.toLowerCase().endsWith(".md")
    ) {
      extractedText = req.file.buffer.toString("utf-8");
    } else {
      return res.status(400).json({ error: "Only PDF, TXT, and Markdown files are supported" });
    }

    // Normalize whitespace
    extractedText = extractedText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

    if (!extractedText || extractedText.length < 20) {
      return res.status(422).json({ error: "Could not extract meaningful text from this file. Try a text-selectable PDF or a .txt file." });
    }

    res.json({ text: extractedText, chars: extractedText.length, words: extractedText.split(/\s+/).filter(Boolean).length });
  } catch (error: any) {
    console.error("File parse error:", error);
    res.status(500).json({ error: error?.message || "Failed to parse file" });
  }
});

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

router.get("/rag/documents/:id", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const doc = await CourseDocumentModel.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: "Document not found" });
    res.json({ ...doc, id: (doc as any)._id });
  } catch (error) {
    res.status(500).json({ error: "Failed to get document" });
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
    if (subject && subject !== "All Subjects") query.subject = subject;
    const allDocs = await CourseDocumentModel.find(query).lean();

    // Improved keyword extraction: min 2 chars, remove stopwords
    const rawWords = question.toLowerCase().split(/\s+/);
    const queryWords = rawWords.filter(w => w.length >= 2 && !SEARCH_STOPWORDS.has(w));

    const scoredChunks: Array<{ chunk: string; score: number; docTitle: string; docSubject: string }> = [];

    for (const doc of allDocs) {
      const chunks: string[] = JSON.parse((doc as any).chunks || "[]");
      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const chunkLower = chunk.toLowerCase();
        let score = 0;
        for (const word of queryWords) {
          if (chunkLower.includes(word)) {
            score += 1;
            // Bonus: word appears in the first 80 chars (likely a heading)
            if (chunkLower.substring(0, 80).includes(word)) score += 0.5;
          }
        }
        if (score > 0) {
          scoredChunks.push({ chunk, score, docTitle: (doc as any).title, docSubject: (doc as any).subject || "General" });
        }
      }
    }

    scoredChunks.sort((a, b) => b.score - a.score);
    const topChunks = scoredChunks.slice(0, 5);
    const maxScore = queryWords.length || 1;

    let answer = "I couldn't find relevant information in the uploaded course materials.";
    const sources = topChunks.map(c => ({
      documentTitle: c.docTitle,
      subject: c.docSubject,
      chunk: c.chunk.substring(0, 250),
      relevanceScore: Math.round((c.score / maxScore) * 100)
    }));

    if (topChunks.length > 0) {
      answer = `Found in "${topChunks[0].docTitle}":\n\n${topChunks[0].chunk.substring(0, 600)}`;
    }

    // Generate study tips based on the question
    const studyTips = intelligence.generateDoubtReplies(question.trim());

    await RagChatModel.create({
      userId: req.user!.id,
      question: question.trim(),
      answer,
      sources: JSON.stringify(sources),
      subject: subject || "General",
    });

    res.json({ answer, sources, studyTips, documentsSearched: allDocs.length });
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
