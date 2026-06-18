import mongoose, { Schema, model, InferSchemaType } from "mongoose";
import { z } from "zod";

const stringId = {
  type: String,
  default: () => new mongoose.Types.ObjectId().toString(),
};

// Schemas
const userSchema = new Schema(
  {
    _id: stringId,
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ["student", "teacher", "admin"], default: "student" },
    department: { type: String },
    status: { type: String, default: "active" },
    lastLogin: { type: Date },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "users" },
);

const teacherSchema = new Schema(
  {
    _id: stringId,
    name: { type: String, required: true },
    department: { type: String, required: true },
    subject: { type: String, required: true },
    averageRating: { type: Number, default: 0 },
    totalFeedback: { type: Number, default: 0 },
    bio: { type: String },
    profileImage: { type: String },
    officeHours: { type: String },
    contactInfo: { type: String },
    teachingPhilosophy: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "teachers" },
);

const feedbackSchema = new Schema(
  {
    _id: stringId,
    teacherId: { type: String, ref: "Teacher", required: true },
    studentId: { type: String, ref: "User", required: true },
    studentName: { type: String, required: true },
    isAnonymous: { type: Boolean, default: false },
    rating: { type: Number, required: true },
    comment: { type: String },
    subject: { type: String },
    createdAt: { type: Date, default: Date.now },
    readAt: { type: Date },
    resolvedAt: { type: Date },
  },
  { collection: "feedback" },
);
feedbackSchema.index({ teacherId: 1, studentId: 1 }, { unique: true });

const feedbackFlagSchema = new Schema(
  {
    _id: stringId,
    feedbackId: { type: String, ref: "Feedback", required: true },
    userId: { type: String, ref: "User", required: true },
    reason: { type: String },
    status: { type: String, default: "open" },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "feedback_flags" },
);

const officeSlotSchema = new Schema(
  {
    _id: stringId,
    teacherId: { type: String, ref: "Teacher", required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: { type: String, default: "open" },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "office_slots" },
);

const officeBookingSchema = new Schema(
  {
    _id: stringId,
    slotId: { type: String, ref: "OfficeSlot", required: true },
    studentId: { type: String, ref: "User", required: true },
    status: { type: String, default: "booked" },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "office_bookings" },
);
officeBookingSchema.index({ slotId: 1 }, { unique: true });

const replySchema = new Schema(
  {
    _id: stringId,
    feedbackId: { type: String, ref: "Feedback", required: true },
    userId: { type: String, ref: "User", required: true },
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "replies" },
);

const feedbackAnalysisSchema = new Schema(
  {
    _id: stringId,
    feedbackId: { type: String, ref: "Feedback", required: true, unique: true },
    sentiment: { type: String },
    sentimentScore: { type: Number },
    qualityScore: { type: Number },
    keywords: { type: String },
    analyzedAt: { type: Date, default: Date.now },
  },
  { collection: "feedback_analysis" },
);

const teacherSummarySchema = new Schema(
  {
    _id: stringId,
    teacherId: { type: String, ref: "Teacher", required: true },
    summary: { type: String, required: true },
    strengths: { type: String },
    improvements: { type: String },
    generatedAt: { type: Date, default: Date.now },
  },
  { collection: "teacher_summaries" },
);

const chatHistorySchema = new Schema(
  {
    _id: stringId,
    userId: { type: String, ref: "User" },
    message: { type: String, required: true },
    response: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "chat_history" },
);

const favoriteSchema = new Schema(
  {
    _id: stringId,
    studentId: { type: String, ref: "User", required: true },
    teacherId: { type: String, ref: "Teacher", required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "favorites" },
);
favoriteSchema.index({ studentId: 1, teacherId: 1 }, { unique: true });

const doubtSchema = new Schema(
  {
    _id: stringId,
    teacherId: { type: String, ref: "Teacher", required: true },
    studentId: { type: String, ref: "User", required: true },
    studentName: { type: String, required: true },
    question: { type: String, required: true },
    answer: { type: String },
    status: { type: String, default: "open" },
    createdAt: { type: Date, default: Date.now },
    answeredAt: { type: Date },
  },
  { collection: "doubts" },
);

const studyGroupMemberSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const studyGroupSchema = new Schema(
  {
    _id: stringId,
    name: { type: String, required: true },
    description: { type: String, default: "" },
    subject: { type: String, required: true },
    creatorId: { type: String, ref: "User", required: true },
    creatorName: { type: String, required: true },
    members: { type: [studyGroupMemberSchema], default: [] },
    maxMembers: { type: Number, default: 10 },
    isPrivate: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
    lastActivity: { type: Date },
  },
  { collection: "study_groups" },
);

const studentAchievementClaimSchema = new Schema(
  {
    _id: stringId,
    studentId: { type: String, ref: "User", required: true },
    achievementId: { type: String, required: true },
    unlockedAt: { type: Date, default: Date.now },
    claimedAt: { type: Date, default: Date.now },
  },
  { collection: "student_achievement_claims" },
);
studentAchievementClaimSchema.index({ studentId: 1, achievementId: 1 }, { unique: true });

const actionItemSchema = new Schema(
  {
    _id: stringId,
    teacherId: { type: String, ref: "Teacher", required: true },
    action: { type: String, required: true },
    priority: { type: String, enum: ["high", "medium", "low"], default: "medium" },
    category: { type: String, default: "general" },
    basedOn: { type: String, default: "" },
    status: { type: String, enum: ["pending", "in-progress", "completed", "dismissed"], default: "pending" },
    generatedAt: { type: Date, default: Date.now },
  },
  { collection: "action_items" },
);

const weeklyDigestSchema = new Schema(
  {
    _id: stringId,
    teacherId: { type: String, ref: "Teacher", required: true },
    headline: { type: String, required: true },
    ratingTrend: { type: String, default: "stable" },
    topStrengths: { type: String, default: "[]" },
    focusAreas: { type: String, default: "[]" },
    studentEngagement: { type: String, default: "" },
    motivationalNote: { type: String, default: "" },
    weekSummary: { type: String, default: "" },
    weekStartDate: { type: Date, required: true },
    generatedAt: { type: Date, default: Date.now },
  },
  { collection: "weekly_digests" },
);

const feedbackCategorySchema = new Schema(
  {
    _id: stringId,
    feedbackId: { type: String, ref: "Feedback", required: true, unique: true },
    categories: { type: String, default: "[]" },
    primaryCategory: { type: String, default: "general" },
    confidence: { type: Number, default: 0.5 },
    categorizedAt: { type: Date, default: Date.now },
  },
  { collection: "feedback_categories" },
);

// Models
export const UserModel = model("User", userSchema);
export const TeacherModel = model("Teacher", teacherSchema);
export const FeedbackModel = model("Feedback", feedbackSchema);
export const FeedbackFlagModel = model("FeedbackFlag", feedbackFlagSchema);
export const OfficeSlotModel = model("OfficeSlot", officeSlotSchema);
export const OfficeBookingModel = model("OfficeBooking", officeBookingSchema);
export const ReplyModel = model("Reply", replySchema);
export const FeedbackAnalysisModel = model("FeedbackAnalysis", feedbackAnalysisSchema);
export const TeacherSummaryModel = model("TeacherSummary", teacherSummarySchema);
export const ChatHistoryModel = model("ChatHistory", chatHistorySchema);
export const FavoriteModel = model("Favorite", favoriteSchema);
export const DoubtModel = model("Doubt", doubtSchema);
export const StudyGroupModel = model("StudyGroup", studyGroupSchema);
export const StudentAchievementClaimModel = model("StudentAchievementClaim", studentAchievementClaimSchema);
export const ActionItemModel = model("ActionItem", actionItemSchema);
export const WeeklyDigestModel = model("WeeklyDigest", weeklyDigestSchema);
export const FeedbackCategoryModel = model("FeedbackCategory", feedbackCategorySchema);

// Intelligence Schemas

const topicAnalysisSchema = new Schema(
  {
    _id: stringId,
    teacherId: { type: String, ref: "Teacher", required: true },
    frequency: { type: String, default: "[]" }, // JSON array of topic frequency data
    weakAreas: { type: String, default: "[]" },
    totalFeedback: { type: Number, default: 0 },
    topicsDetected: { type: Number, default: 0 },
    analyzedAt: { type: Date, default: Date.now },
  },
  { collection: "topic_analyses" },
);

const studentRiskSchema = new Schema(
  {
    _id: stringId,
    teacherId: { type: String, ref: "Teacher", required: true },
    studentId: { type: String, ref: "User" },
    studentName: { type: String, required: true },
    riskLevel: { type: String, enum: ["high", "medium", "low"], default: "low" },
    riskScore: { type: Number, default: 0 },
    attendance: { type: Number, default: 75 },
    marks: { type: Number, default: 50 },
    sentimentPolarity: { type: Number, default: 0 },
    engagementScore: { type: Number, default: 50 },
    factors: { type: String, default: "[]" },
    recommendations: { type: String, default: "[]" },
    predictedAt: { type: Date, default: Date.now },
  },
  { collection: "student_risks" },
);

const aiSuggestionSchema = new Schema(
  {
    _id: stringId,
    teacherId: { type: String, ref: "Teacher", required: true },
    suggestions: { type: String, default: "[]" }, // JSON array
    sentimentOverview: { type: String, default: "{}" }, // JSON
    topicAnalysis: { type: String, default: "[]" }, // JSON
    summary: { type: String, default: "" },
    generatedAt: { type: Date, default: Date.now },
  },
  { collection: "ai_suggestions" },
);

const sentimentSnapshotSchema = new Schema(
  {
    _id: stringId,
    teacherId: { type: String, ref: "Teacher", required: true },
    positive: { type: Number, default: 0 },
    negative: { type: Number, default: 0 },
    neutral: { type: Number, default: 0 },
    positivePercent: { type: Number, default: 0 },
    negativePercent: { type: Number, default: 0 },
    neutralPercent: { type: Number, default: 0 },
    avgPolarity: { type: Number, default: 0 },
    totalAnalyzed: { type: Number, default: 0 },
    snapshotAt: { type: Date, default: Date.now },
  },
  { collection: "sentiment_snapshots" },
);

const alertSchema = new Schema(
  {
    _id: stringId,
    teacherId: { type: String, ref: "Teacher", required: true },
    type: { type: String, enum: ["negative_spike", "risk_alert", "low_rating", "topic_alert"], required: true },
    severity: { type: String, enum: ["critical", "warning", "info"], default: "warning" },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: { type: String, default: "{}" },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "ai_alerts" },
);

export const TopicAnalysisModel = model("TopicAnalysis", topicAnalysisSchema);
export const StudentRiskModel = model("StudentRisk", studentRiskSchema);
export const AISuggestionModel = model("AISuggestion", aiSuggestionSchema);
export const SentimentSnapshotModel = model("SentimentSnapshot", sentimentSnapshotSchema);
export const AlertModel = model("Alert", alertSchema);

// Module 1: Face Recognition Attendance
const passcodeRegistrationSchema = new Schema(
  {
    _id: stringId,
    userId: { type: String, ref: "User", required: true },
    passcode: { type: String, required: true },
    registeredAt: { type: Date, default: Date.now },
  },
  { collection: "passcode_registrations" },
);
passcodeRegistrationSchema.index({ userId: 1 }, { unique: true });

const attendanceSessionSchema = new Schema(
  {
    _id: stringId,
    teacherId: { type: String, ref: "Teacher", required: true },
    subject: { type: String, required: true },
    date: { type: Date, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date },
    code: { type: String },
    status: { type: String, enum: ["active", "closed"], default: "active" },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "attendance_sessions" },
);

const attendanceRecordSchema = new Schema(
  {
    _id: stringId,
    sessionId: { type: String, ref: "AttendanceSession", required: true },
    studentId: { type: String, ref: "User", required: true },
    studentName: { type: String, required: true },
    markedAt: { type: Date, default: Date.now },
    method: { type: String, enum: ["passcode", "manual", "qr"], default: "passcode" },
    isProxy: { type: Boolean, default: false },
    proxyDetails: { type: String },
  },
  { collection: "attendance_records" },
);
attendanceRecordSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });

export const PasscodeRegistrationModel = model("PasscodeRegistration", passcodeRegistrationSchema);
export const AttendanceSessionModel = model("AttendanceSession", attendanceSessionSchema);
export const AttendanceRecordModel = model("AttendanceRecord", attendanceRecordSchema);

// Module 2: Lecture Summarizer

const lectureSummarySchema = new Schema(
  {
    _id: stringId,
    teacherId: { type: String, ref: "Teacher", required: true },
    title: { type: String, required: true },
    subject: { type: String, required: true },
    transcript: { type: String, required: true },
    summary: { type: String, default: "" },
    keyTopics: { type: String, default: "[]" }, // JSON array
    flashcards: { type: String, default: "[]" }, // JSON array of {question, answer}
    duration: { type: Number, default: 0 }, // seconds
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "lecture_summaries" },
);

export const LectureSummaryModel = model("LectureSummary", lectureSummarySchema);

// Module 3: Quiz + Cheating Detection

const quizSchema = new Schema(
  {
    _id: stringId,
    teacherId: { type: String, ref: "Teacher", required: true },
    title: { type: String, required: true },
    subject: { type: String, required: true },
    questions: { type: String, required: true }, // JSON array of {question, options[], correctAnswer, points}
    duration: { type: Number, required: true }, // minutes
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "quizzes" },
);

const quizAttemptSchema = new Schema(
  {
    _id: stringId,
    quizId: { type: String, ref: "Quiz", required: true },
    studentId: { type: String, ref: "User", required: true },
    studentName: { type: String, required: true },
    answers: { type: String, required: true }, // JSON array of student answers
    score: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date },
    // Cheating Detection Fields
    tabSwitches: { type: Number, default: 0 },
    copyPasteAttempts: { type: Number, default: 0 },
    rightClickAttempts: { type: Number, default: 0 },
    suspiciousTimePatterns: { type: Number, default: 0 },
    cheatingScore: { type: Number, default: 0 }, // 0-100
    cheatingFlags: { type: String, default: "[]" }, // JSON array of flag descriptions
    isFlagged: { type: Boolean, default: false },
  },
  { collection: "quiz_attempts" },
);
quizAttemptSchema.index({ quizId: 1, studentId: 1 }, { unique: true });

export const QuizModel = model("Quiz", quizSchema);
export const QuizAttemptModel = model("QuizAttempt", quizAttemptSchema);

// Module 4: Predictive Performance

const studentPerformanceSchema = new Schema(
  {
    _id: stringId,
    studentId: { type: String, ref: "User", required: true },
    studentName: { type: String, required: true },
    attendance: { type: Number, default: 0 }, // percentage
    assignmentsSubmitted: { type: Number, default: 0 },
    assignmentsTotal: { type: Number, default: 0 },
    quizAverage: { type: Number, default: 0 },
    feedbackSentiment: { type: Number, default: 0 }, // avg polarity
    engagementScore: { type: Number, default: 0 },
    predictedGrade: { type: String, default: "B" },
    failProbability: { type: Number, default: 0 }, // 0-100
    riskLevel: { type: String, enum: ["high", "medium", "low"], default: "low" },
    recommendations: { type: String, default: "[]" }, // JSON array
    predictedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "student_performance" },
);
studentPerformanceSchema.index({ studentId: 1 }, { unique: true });

export const StudentPerformanceModel = model("StudentPerformance", studentPerformanceSchema);

// Module 5: RAG Chatbot

const courseDocumentSchema = new Schema(
  {
    _id: stringId,
    teacherId: { type: String, ref: "Teacher" },
    title: { type: String, required: true },
    subject: { type: String, required: true },
    content: { type: String, required: true }, // full text content
    chunks: { type: String, default: "[]" }, // JSON array of text chunks
    uploadedBy: { type: String, ref: "User", required: true },
    fileType: { type: String, default: "text" },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "course_documents" },
);

const ragChatSchema = new Schema(
  {
    _id: stringId,
    userId: { type: String, ref: "User", required: true },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    sources: { type: String, default: "[]" }, // JSON array of {documentTitle, chunk, relevanceScore}
    subject: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "rag_chats" },
);

export const CourseDocumentModel = model("CourseDocument", courseDocumentSchema);
export const RagChatModel = model("RagChat", ragChatSchema);

// Types
export type User = InferSchemaType<typeof userSchema> & { id: string };
export type InsertUser = {
  name: string;
  email: string;
  password: string;
  role?: "student" | "teacher" | "admin";
  department?: string;
  username?: string;
};

export type Teacher = InferSchemaType<typeof teacherSchema> & { id: string };
export type InsertTeacher = {
  name: string;
  department: string;
  subject: string;
  bio?: string;
  profileImage?: string;
  officeHours?: string;
  contactInfo?: string;
  teachingPhilosophy?: string;
};
export type UpdateTeacher = Partial<Omit<InsertTeacher, "name" | "department" | "subject">>;

export type Feedback = InferSchemaType<typeof feedbackSchema> & { id: string };
export type InsertFeedback = {
  teacherId: string;
  studentId: string;
  studentName: string;
  isAnonymous?: boolean;
  rating: number;
  comment?: string | null;
  subject?: string | null;
};

export type Reply = InferSchemaType<typeof replySchema> & { id: string };
export type InsertReply = {
  feedbackId: string;
  userId: string;
  userName: string;
  userRole: string;
  content: string;
};

export type FeedbackAnalysis = InferSchemaType<typeof feedbackAnalysisSchema> & { id: string };
export type TeacherSummary = InferSchemaType<typeof teacherSummarySchema> & { id: string };
export type ChatHistory = InferSchemaType<typeof chatHistorySchema> & { id: string };

export type Favorite = InferSchemaType<typeof favoriteSchema> & { id: string };
export type InsertFavorite = {
  studentId: string;
  teacherId: string;
};

export type Doubt = InferSchemaType<typeof doubtSchema> & { id: string };
export type InsertDoubt = {
  teacherId: string;
  studentId: string;
  studentName: string;
  question: string;
};

export type StudyGroup = InferSchemaType<typeof studyGroupSchema> & { id: string };
export type StudentAchievementClaim = InferSchemaType<typeof studentAchievementClaimSchema> & { id: string };

export type ActionItem = InferSchemaType<typeof actionItemSchema> & { id: string };
export type WeeklyDigestDoc = InferSchemaType<typeof weeklyDigestSchema> & { id: string };
export type FeedbackCategoryDoc = InferSchemaType<typeof feedbackCategorySchema> & { id: string };

export type TopicAnalysisDoc = InferSchemaType<typeof topicAnalysisSchema> & { id: string };
export type StudentRiskDoc = InferSchemaType<typeof studentRiskSchema> & { id: string };
export type AISuggestionDoc = InferSchemaType<typeof aiSuggestionSchema> & { id: string };
export type SentimentSnapshotDoc = InferSchemaType<typeof sentimentSnapshotSchema> & { id: string };
export type AlertDoc = InferSchemaType<typeof alertSchema> & { id: string };

// Validation Schemas
export const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["student", "teacher"]).optional(),
  department: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().min(1, "Email or Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const insertTeacherSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name is required")
    .refine((v) => v.toLowerCase() !== "name", "Please enter a valid teacher name"),
  department: z.string().trim().min(1, "Department is required"),
  subject: z.string().trim().min(1, "Subject is required"),
  bio: z.string().optional(),
  profileImage: z.string().optional(),
  officeHours: z.string().optional(),
  contactInfo: z.string().optional(),
  teachingPhilosophy: z.string().optional(),
});

export const updateTeacherSchema = z.object({
  bio: z.string().optional(),
  profileImage: z.string().optional(),
  officeHours: z.string().optional(),
  contactInfo: z.string().optional(),
  teachingPhilosophy: z.string().optional(),
});

export const insertReplySchema = z.object({
  feedbackId: z.string().min(1),
  userId: z.string().min(1),
  userName: z.string().min(1),
  userRole: z.string().min(1),
  content: z.string().min(1),
});

export const insertFeedbackSchema = z.object({
  teacherId: z.string().min(1),
  isAnonymous: z.boolean().optional(),
  // Accept numeric strings from forms and coerce them to numbers
  rating: z.coerce.number().min(1).max(5),
  comment: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
});

export const insertDoubtSchema = z.object({
  question: z.string().min(1),
});

// New Module Types

export type PasscodeRegistrationDoc = InferSchemaType<typeof passcodeRegistrationSchema> & { id: string };
export type AttendanceSessionDoc = InferSchemaType<typeof attendanceSessionSchema> & { id: string };
export type AttendanceRecordDoc = InferSchemaType<typeof attendanceRecordSchema> & { id: string };
export type LectureSummaryDoc = InferSchemaType<typeof lectureSummarySchema> & { id: string };
export type QuizDoc = InferSchemaType<typeof quizSchema> & { id: string };
export type QuizAttemptDoc = InferSchemaType<typeof quizAttemptSchema> & { id: string };
export type StudentPerformanceDoc = InferSchemaType<typeof studentPerformanceSchema> & { id: string };
export type CourseDocumentDoc = InferSchemaType<typeof courseDocumentSchema> & { id: string };
export type RagChatDoc = InferSchemaType<typeof ragChatSchema> & { id: string };

// Validation schemas for new modules
export const createQuizSchema = z.object({
  title: z.string().min(1),
  subject: z.string().min(1),
  questions: z.array(z.object({
    question: z.string().min(1),
    options: z.array(z.string()).min(2),
    correctAnswer: z.number().min(0),
    points: z.number().min(1).default(10),
  })).min(1),
  duration: z.number().min(1).max(180),
});

export const submitQuizSchema = z.object({
  answers: z.array(z.number()),
  tabSwitches: z.number().default(0),
  copyPasteAttempts: z.number().default(0),
  rightClickAttempts: z.number().default(0),
  suspiciousTimePatterns: z.number().default(0),
});
