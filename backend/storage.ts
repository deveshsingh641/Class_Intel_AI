import {
  type User,
  type InsertUser,
  type Teacher,
  type InsertTeacher,
  type UpdateTeacher,
  type Feedback,
  type InsertFeedback,
  type Reply,
  type InsertReply,
  type FeedbackAnalysis,
  type TeacherSummary,
  type ChatHistory,
  type Doubt,
  type InsertDoubt,
  type Favorite,
  type InsertFavorite,
  type StudyGroup,
  StudyGroupModel,
  StudentAchievementClaimModel,
  UserModel,
  TeacherModel,
  FeedbackModel,
  FeedbackFlagModel,
  OfficeSlotModel,
  OfficeBookingModel,
  ReplyModel,
  FeedbackAnalysisModel,
  TeacherSummaryModel,
  ChatHistoryModel,
  FavoriteModel,
  DoubtModel,
} from "@shared/schema";
import bcrypt from "bcryptjs";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getTeachers(): Promise<Teacher[]>;
  getTeacher(id: string): Promise<Teacher | undefined>;
  createTeacher(teacher: InsertTeacher): Promise<Teacher>;
  updateTeacher(id: string, updates: UpdateTeacher): Promise<Teacher>;
  deleteTeacher(id: string): Promise<void>;
  
  getAllUsers(): Promise<any[]>;
  updateUserStatus(userId: string, status: string): Promise<any>;
  updateUserRole(userId: string, role: string): Promise<any>;
  
  getFeedbackByTeacher(teacherId: string): Promise<Feedback[]>;
  getFeedbackByStudent(studentId: string): Promise<Feedback[]>;
  createFeedback(feedbackData: {
    teacherId: string;
    studentId: string;
    studentName: string;
    isAnonymous?: boolean;
    rating: number;
    comment?: string | null;
    subject?: string | null;
  }): Promise<Feedback>;
  hasFeedback(teacherId: string, studentId: string): Promise<boolean>;
  getStudentFeedbackTeachers(studentId: string): Promise<string[]>;

  getRepliesByFeedback(feedbackId: string): Promise<Reply[]>;
  createReply(replyData: InsertReply): Promise<Reply>;
  deleteReply(replyId: string, userId: string): Promise<void>;

  createFeedbackFlag(data: { feedbackId: string; userId: string; reason?: string | null }): Promise<void>;
  getFeedbackFlags(status?: string): Promise<Array<{ id: string; feedbackId: string; userId: string; reason: string | null; status: string; createdAt: Date | null }>>;
  getFeedbackFlagsDetailed(status?: string): Promise<Array<{
    id: string;
    feedbackId: string;
    userId: string;
    reason: string | null;
    status: string;
    createdAt: Date | null;
    feedback?: Feedback | null;
  }>>;
  updateFeedbackFlagStatus(flagId: string, status: string): Promise<void>;
  
  getFeedbackTrends(teacherId: string, startDate?: Date, endDate?: Date): Promise<Array<{ date: string; count: number; avgRating: number }>>;
  getDepartmentComparison(): Promise<Array<{ department: string; avgRating: number; totalFeedback: number }>>;
  getMonthlyPerformance(teacherId: string): Promise<Array<{ month: string; count: number; avgRating: number }>>;
  getTopRatedTeachers(limit?: number): Promise<Array<Teacher & { rank: number }>>;
  getMostFeedbackTeachers(limit?: number): Promise<Array<Teacher & { rank: number }>>;
  getMostImprovedTeachers(limit?: number): Promise<Array<Teacher & { rank: number; improvement: number }>>;
  getTeacherImprovement(teacherId: string): Promise<{
    improvement: number;
    recentAverage: number;
    previousAverage: number;
  } | null>;
  getRecentActivity(limit?: number): Promise<Array<Feedback & { teacherName: string }>>;
  getAllFeedback(): Promise<Feedback[]>;
  getFeedbackById(feedbackId: string): Promise<Feedback | undefined>;
  deleteFeedback(feedbackId: string): Promise<Feedback | undefined>;
  getFlaggedFeedback(abusiveWords: string[]): Promise<Array<Feedback & { teacherName?: string; department?: string }>>;
  getOverdueDoubts(days: number): Promise<Array<Doubt & { teacherName?: string; department?: string }>>;
  createDoubt(doubt: Omit<InsertDoubt, "teacherId" | "studentId" | "studentName"> & { teacherId: string; studentId: string; studentName: string }): Promise<Doubt>;
  getDoubtsByTeacher(teacherId: string): Promise<Doubt[]>;
  getDoubtsByStudent(studentId: string): Promise<Doubt[]>;
  answerDoubt(doubtId: string, answer: string): Promise<Doubt>;

  listStudyGroups(): Promise<StudyGroup[]>;
  listMyStudyGroups(userId: string): Promise<StudyGroup[]>;
  createStudyGroup(data: {
    name: string;
    description?: string;
    subject: string;
    creatorId: string;
    creatorName: string;
    maxMembers?: number;
    isPrivate?: boolean;
    tags?: string[];
  }): Promise<StudyGroup>;
  joinStudyGroup(groupId: string, user: { id: string; name: string }): Promise<StudyGroup>;

  getStudentGamification(userId: string): Promise<{
    level: number;
    points: number;
    nextLevelPoints: number;
    streak: number;
    totalFeedback: number;
    weeklyGoal: number;
    weeklyProgress: number;
    achievements: Array<{
      id: string;
      title: string;
      description: string;
      icon: string;
      points: number;
      unlocked: boolean;
      unlockedAt?: string;
      category: string;
    }>;
    leaderboard?: { rank: number; totalStudents: number };
  }>;
  claimStudentAchievement(userId: string, achievementId: string): Promise<{ ok: true; unlockedAt: Date }>;

  createOfficeSlot(data: { teacherId: string; startTime: Date; endTime: Date }): Promise<any>;
  listOfficeSlots(teacherId: string): Promise<any[]>;
  bookOfficeSlot(slotId: string, studentId: string): Promise<any>;
  listMyBookings(studentId: string): Promise<any[]>;
  cancelBooking(bookingId: string, studentId: string): Promise<void>;
  getFavoritesByStudent(studentId: string): Promise<Favorite[]>;
  addFavorite(studentId: string, teacherId: string): Promise<Favorite>;
  removeFavorite(studentId: string, teacherId: string): Promise<void>;
  
  saveFeedbackAnalysis(data: {
    feedbackId: string;
    sentiment: string;
    sentimentScore: number;
    qualityScore: number;
    keywords: string;
  }): Promise<void>;
  getFeedbackAnalysis(feedbackId: string): Promise<FeedbackAnalysis | undefined>;
  saveTeacherSummary(data: {
    teacherId: string;
    summary: string;
    strengths: string;
    improvements: string;
  }): Promise<void>;
  getLatestTeacherSummary(teacherId: string): Promise<TeacherSummary | undefined>;
  saveChatMessage(data: {
    userId?: string;
    message: string;
    response: string;
  }): Promise<void>;
  getChatHistory(userId: string, limit?: number): Promise<ChatHistory[]>;

  markFeedbackRead(feedbackId: string): Promise<Feedback | undefined>;
  markFeedbackResolved(feedbackId: string, studentId: string): Promise<Feedback | undefined>;
}

function withId<T extends { _id?: any; id?: any }>(doc: any): T {
  if (!doc) return doc;
  const obj = doc.toObject ? doc.toObject() : doc;
  const id = obj.id ?? (obj._id ? obj._id.toString?.() ?? obj._id : undefined);
  return { ...obj, id } as T;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<(User & { id: string }) | undefined> {
    const doc = await UserModel.findById(id).lean();
    return doc ? withId<User & { id: string }>(doc) : undefined;
  }

  async getUserByEmail(email: string): Promise<(User & { id: string }) | undefined> {
    const doc = await UserModel.findOne({ email }).lean();
    return doc ? withId<User & { id: string }>(doc) : undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User & { id: string }> {
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);
    const userDoc = await UserModel.create({
      ...insertUser,
      password: hashedPassword,
      username: insertUser.username ?? insertUser.email.split("@")[0],
    });
    return withId<User & { id: string }>(userDoc);
  }

  async getTeachers(): Promise<Array<Teacher & { id: string }>> {
    const docs = await TeacherModel.find({}).sort({ name: 1 }).lean();
    return docs.map((d) => withId<Teacher & { id: string }>(d));
  }

  async getTeacher(id: string): Promise<(Teacher & { id: string }) | undefined> {
    const doc = await TeacherModel.findById(id).lean();
    return doc ? withId<Teacher & { id: string }>(doc) : undefined;
  }

  async getTeacherByName(name: string): Promise<(Teacher & { id: string }) | undefined> {
    // Case-insensitive exact match on name to pair teacher users with their profile
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const doc = await TeacherModel.findOne({ name: { $regex: `^${escaped}$`, $options: "i" } }).lean();
    return doc ? withId<Teacher & { id: string }>(doc) : undefined;
  }

  async getTeacherByLooseName(name: string): Promise<(Teacher & { id: string }) | undefined> {
    // Normalize whitespace and match case-insensitively to tolerate slight name variations
    const normalized = name.trim().replace(/\s+/g, " ");
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const doc = await TeacherModel.findOne({ name: { $regex: `^${escaped}$`, $options: "i" } }).lean();
    return doc ? withId<Teacher & { id: string }>(doc) : undefined;
  }

  async createTeacher(insertTeacher: InsertTeacher): Promise<Teacher & { id: string }> {
    const teacher = await TeacherModel.create(insertTeacher);
    return withId<Teacher & { id: string }>(teacher);
  }

  async updateTeacher(id: string, updates: UpdateTeacher): Promise<Teacher & { id: string }> {
    const updated = await TeacherModel.findByIdAndUpdate(id, updates, { new: true }).lean();
    if (!updated) throw new Error("Teacher not found");
    return withId<Teacher & { id: string }>(updated);
  }

  async deleteTeacher(id: string): Promise<void> {
    await TeacherModel.findByIdAndDelete(id);
  }

  async getAllUsers(): Promise<any[]> {
    const users = await UserModel.find().lean();
    return users.map(user => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status || 'active',
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      department: user.department,
    }));
  }

  async updateUserStatus(userId: string, status: string): Promise<any> {
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { status },
      { new: true }
    ).lean();
    
    if (!user) return null;
    
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      department: user.department,
    };
  }

  async updateUserRole(userId: string, role: string): Promise<any> {
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { role },
      { new: true }
    ).lean();
    
    if (!user) return null;
    
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      department: user.department,
    };
  }

  async getFeedbackByTeacher(teacherId: string): Promise<Feedback[]> {
    const rows = await FeedbackModel.find({ teacherId }).sort({ createdAt: -1 }).lean();
    return rows.map((r) => withId<Feedback>(r));
  }

  async getFeedbackByStudent(studentId: string): Promise<Feedback[]> {
    const rows = await FeedbackModel.find({ studentId }).sort({ createdAt: -1 }).lean();
    return rows.map((r) => withId<Feedback>(r));
  }

  async hasFeedback(teacherId: string, studentId: string): Promise<boolean> {
    const existing = await FeedbackModel.findOne({ teacherId, studentId }).lean();
    return !!existing;
  }

  async getStudentFeedbackTeachers(studentId: string): Promise<string[]> {
    const result = await FeedbackModel.find({ studentId }).select("teacherId").lean();
    return result.map((r: { teacherId: string }) => r.teacherId);
  }

  async createFeedback(feedbackData: {
        teacherId: string;
        studentId: string;
        studentName: string;
        isAnonymous?: boolean;
        rating: number;
        comment?: string | null;
        subject?: string | null;
      }): Promise<Feedback> {
    const created = await FeedbackModel.create({
      ...feedbackData,
      isAnonymous: !!feedbackData.isAnonymous,
    });

    await this.recalculateTeacherStats(feedbackData.teacherId);

    return withId<Feedback>(created);
  }

  async markFeedbackRead(feedbackId: string): Promise<Feedback | undefined> {
    const updated = await FeedbackModel.findOneAndUpdate(
      { _id: feedbackId, readAt: { $exists: false } },
      { readAt: new Date() },
      { new: true },
    ).lean();
    return updated ? withId<Feedback>(updated) : undefined;
  }

  async markFeedbackResolved(feedbackId: string, studentId: string): Promise<Feedback | undefined> {
    const updated = await FeedbackModel.findOneAndUpdate(
      { _id: feedbackId, studentId, resolvedAt: { $exists: false } },
      { resolvedAt: new Date() },
      { new: true },
    ).lean();
    return updated ? withId<Feedback>(updated) : undefined;
  }

  async updateFeedbackTeacher(feedbackId: string, newTeacherId: string): Promise<Feedback | undefined> {
    const existing = await FeedbackModel.findById(feedbackId).lean();
    if (!existing) return undefined;

    const currentTeacherId = (existing as any).teacherId;

    const updated = await FeedbackModel.findByIdAndUpdate(
      feedbackId,
      { teacherId: newTeacherId },
      { new: true },
    ).lean();

    // Recalculate stats for both the previous and new teacher to keep aggregates accurate
    if (currentTeacherId) {
      await this.recalculateTeacherStats(currentTeacherId);
    }
    await this.recalculateTeacherStats(newTeacherId);

    return updated ? withId<Feedback>(updated) : undefined;
  }

  async getRepliesByFeedback(feedbackId: string): Promise<Reply[]> {
    const rows = await ReplyModel.find({ feedbackId }).sort({ createdAt: 1 }).lean();
    return rows.map((r) => withId<Reply>(r));
  }

  async createReply(replyData: InsertReply): Promise<Reply> {
    const reply = await ReplyModel.create(replyData);
    return withId<Reply>(reply);
  }

  async deleteReply(replyId: string, userId: string): Promise<void> {
    await ReplyModel.deleteOne({ _id: replyId, userId });
  }

  async createFeedbackFlag(data: { feedbackId: string; userId: string; reason?: string | null }): Promise<void> {
    await FeedbackFlagModel.create({
      feedbackId: data.feedbackId,
      userId: data.userId,
      reason: data.reason || null,
    });
  }

  async getFeedbackFlags(status?: string) {
    const query = status ? { status } : {};
    const rows = await FeedbackFlagModel.find(query).lean();
    return rows.map((r: any) => ({
      id: (r._id || r.id)?.toString?.() ?? r._id ?? r.id,
      feedbackId: r.feedbackId,
      userId: r.userId,
      reason: r.reason ?? null,
      status: r.status,
      createdAt: r.createdAt ?? null,
    }));
  }

  async getFeedbackFlagsDetailed(status?: string) {
    const flags = await this.getFeedbackFlags(status);
    const ids = flags.map((f) => f.feedbackId);
    const feedbackRows = ids.length ? await FeedbackModel.find({ _id: { $in: ids } }).lean() : [];
    const feedbackMap = new Map<string, Feedback>(feedbackRows.map((f: any) => [f._id.toString(), f as Feedback]));
    return flags.map((f) => ({
      id: f.id,
      feedbackId: f.feedbackId,
      userId: f.userId,
      reason: f.reason,
      status: f.status,
      createdAt: f.createdAt,
      feedback: feedbackMap.get(f.feedbackId.toString()) || null,
    }));
  }

  async updateFeedbackFlagStatus(flagId: string, status: string): Promise<void> {
    await FeedbackFlagModel.updateOne({ _id: flagId }, { status });
  }

  async createOfficeSlot(data: { teacherId: string; startTime: Date; endTime: Date }) {
    const slot = await OfficeSlotModel.create({
      teacherId: data.teacherId,
      startTime: data.startTime,
      endTime: data.endTime,
    });
    return slot.toObject();
  }

  async listOfficeSlots(teacherId: string) {
    return OfficeSlotModel.find({ teacherId }).sort({ startTime: 1 }).lean();
  }

  async bookOfficeSlot(slotId: string, studentId: string) {
    const slot = await OfficeSlotModel.findOneAndUpdate(
      { _id: slotId, status: "open" },
      { status: "booked" },
      { new: true },
    );
    if (!slot) throw new Error("Slot not available");
    const booking = await OfficeBookingModel.create({
      slotId,
      studentId,
      status: "booked",
    });
    return booking.toObject();
  }

  async listMyBookings(studentId: string) {
    const bookings = await OfficeBookingModel.find({ studentId }).lean();
    const slotIds = bookings.map((b: any) => b.slotId);
    const slots = slotIds.length ? await OfficeSlotModel.find({ _id: { $in: slotIds } }).lean() : [];
    const slotMap = new Map<string, any>(slots.map((s: any) => [s._id.toString(), s]));
    return bookings.map((b: any) => ({
      ...b,
      slot: slotMap.get(b.slotId.toString()) || null,
    }));
  }

  async cancelBooking(bookingId: string, studentId: string): Promise<void> {
    const booking = await OfficeBookingModel.findOne({ _id: bookingId, studentId }).lean();
    if (!booking) {
      throw new Error("Booking not found");
    }
    await OfficeBookingModel.deleteOne({ _id: bookingId });
    await OfficeSlotModel.updateOne({ _id: booking.slotId }, { status: "open" });
  }

  async getFeedbackTrends(teacherId: string, startDate?: Date, endDate?: Date): Promise<Array<{ date: string; count: number; avgRating: number }>> {
    const match: Record<string, any> = { teacherId };
    if (startDate) match.createdAt = { ...(match.createdAt || {}), $gte: startDate };
    if (endDate) match.createdAt = { ...(match.createdAt || {}), $lte: endDate };

    const rows = await FeedbackModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
          avgRating: { $avg: "$rating" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return rows.map((r: any) => ({
      date: r._id,
      count: r.count,
      avgRating: r.avgRating,
    }));
  }

  async getDepartmentComparison(): Promise<Array<{ department: string; avgRating: number; totalFeedback: number }>> {
    const rows = await TeacherModel.aggregate([
      {
        $group: {
          _id: "$department",
          avgRating: { $avg: "$averageRating" },
          totalFeedback: { $sum: "$totalFeedback" },
        },
      },
    ]);
    return rows.map((r: any) => ({
      department: r._id,
      avgRating: r.avgRating || 0,
      totalFeedback: r.totalFeedback || 0,
    }));
  }

  async getMonthlyPerformance(teacherId: string): Promise<Array<{ month: string; count: number; avgRating: number }>> {
    const rows = await FeedbackModel.aggregate([
      { $match: { teacherId } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          count: { $sum: 1 },
          avgRating: { $avg: "$rating" },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return rows.map((r: any) => ({
      month: r._id,
      count: r.count,
      avgRating: r.avgRating,
    }));
  }

  async getTopRatedTeachers(limit: number = 10): Promise<Array<Teacher & { rank: number }>> {
    const topTeachers = await TeacherModel.find({ averageRating: { $gt: 0 } })
      .sort({ averageRating: -1, totalFeedback: -1 })
      .limit(limit)
      .lean();

    return topTeachers.map((teacher: any, index: number) => ({
      ...withId<Teacher>(teacher),
      rank: index + 1,
    }));
  }

  async getMostFeedbackTeachers(limit: number = 10): Promise<Array<Teacher & { rank: number }>> {
    const topTeachers = await TeacherModel.find({ totalFeedback: { $gt: 0 } })
      .sort({ totalFeedback: -1, averageRating: -1 })
      .limit(limit)
      .lean();

    return topTeachers.map((teacher, index) => ({
      ...withId<Teacher>(teacher),
      rank: index + 1,
    }));
  }

  async getMostImprovedTeachers(
    limit: number = 10
  ): Promise<Array<Teacher & { rank: number; improvement: number }>> {
    const daysPerWindow = 30;
    const minFeedbackPerWindow = 2;
    const now = new Date();
    const recentCutoff = new Date(now.getTime() - daysPerWindow * 24 * 60 * 60 * 1000);
    const previousCutoff = new Date(recentCutoff.getTime() - daysPerWindow * 24 * 60 * 60 * 1000);

    const feedbackRows = await FeedbackModel.find({
      createdAt: { $gte: previousCutoff, $lte: now },
    }).lean();

    if (feedbackRows.length === 0) {
      return [];
    }

    const teacherBuckets = new Map<
      string,
      { recentSum: number; recentCount: number; prevSum: number; prevCount: number }
    >();

    for (const fb of feedbackRows) {
      if (!fb.createdAt) continue;
      const created = new Date(fb.createdAt);
      const bucket = teacherBuckets.get(fb.teacherId) || {
        recentSum: 0,
        recentCount: 0,
        prevSum: 0,
        prevCount: 0,
      };
      if (created >= recentCutoff) {
        bucket.recentSum += fb.rating;
        bucket.recentCount += 1;
      } else if (created >= previousCutoff) {
        bucket.prevSum += fb.rating;
        bucket.prevCount += 1;
      }
      teacherBuckets.set(fb.teacherId, bucket);
    }

    const improvedTeacherIds: string[] = [];
    const improvements = new Map<string, number>();

    for (const [teacherId, bucket] of Array.from(teacherBuckets.entries())) {
      if (bucket.recentCount >= minFeedbackPerWindow && bucket.prevCount >= minFeedbackPerWindow) {
        const recentAvg = bucket.recentSum / bucket.recentCount;
        const prevAvg = bucket.prevSum / bucket.prevCount;
        const improvement = recentAvg - prevAvg;
        if (improvement > 0) {
          improvedTeacherIds.push(teacherId);
          improvements.set(teacherId, improvement);
        }
      }
    }

    if (improvedTeacherIds.length === 0) {
      return [];
    }

    const teachersList = await TeacherModel.find({ _id: { $in: improvedTeacherIds } }).lean();

    const sorted = teachersList
      .map((t) => ({
        ...withId<Teacher>(t),
        improvement: improvements.get(t._id.toString()) || 0,
      }))
      .sort((a: any, b: any) => (b.improvement || 0) - (a.improvement || 0))
      .slice(0, limit)
      .map((teacher: any, index: number) => ({
        ...teacher,
        rank: index + 1,
      }));

    return sorted;
  }

  async getTeacherImprovement(teacherId: string): Promise<{
    improvement: number;
    recentAverage: number;
    previousAverage: number;
  } | null> {
    const daysPerWindow = 30;
    const minFeedbackPerWindow = 2;
    const now = new Date();
    const recentCutoff = new Date(now.getTime() - daysPerWindow * 24 * 60 * 60 * 1000);
    const previousCutoff = new Date(
      recentCutoff.getTime() - daysPerWindow * 24 * 60 * 60 * 1000
    );

    const feedbackRows = await FeedbackModel.find({
      teacherId,
      createdAt: { $gte: previousCutoff, $lte: now },
    }).lean();

    if (feedbackRows.length === 0) {
      return null;
    }

    let recentSum = 0;
    let recentCount = 0;
    let prevSum = 0;
    let prevCount = 0;

    for (const fb of feedbackRows) {
      if (!fb.createdAt) continue;
      const created = new Date(fb.createdAt);
      if (created >= recentCutoff) {
        recentSum += fb.rating;
        recentCount += 1;
      } else if (created >= previousCutoff) {
        prevSum += fb.rating;
        prevCount += 1;
      }
    }

    if (recentCount < minFeedbackPerWindow || prevCount < minFeedbackPerWindow) {
      return null;
    }

    const recentAverage = recentSum / recentCount;
    const previousAverage = prevSum / prevCount;
    const improvement = recentAverage - previousAverage;

    if (improvement <= 0) {
      return null;
    }

    return {
      improvement,
      recentAverage,
      previousAverage,
    };
  }

  async getRecentActivity(limit: number = 10): Promise<Array<Feedback & { teacherName: string }>> {
    const recentFeedback = await FeedbackModel.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const teacherIds = recentFeedback.map((fb) => fb.teacherId);
    const teachersMap = new Map(
      (await TeacherModel.find({ _id: { $in: teacherIds } }).lean()).map((t: any) => [t._id.toString(), t]),
    );

    return recentFeedback.map((fb: any) => ({
      ...withId<Feedback>(fb),
      teacherName: teachersMap.get(fb.teacherId)?.name || "Unknown Teacher",
    }));
  }

  async getAllFeedback(): Promise<Feedback[]> {
    const rows = await FeedbackModel.find({}).sort({ createdAt: -1 }).lean();
    return rows.map((r) => withId<Feedback>(r));
  }

  async getFeedbackById(feedbackId: string): Promise<Feedback | undefined> {
    const fb = await FeedbackModel.findById(feedbackId).lean();
    return fb ? withId<Feedback>(fb) : undefined;
  }

  async deleteFeedback(feedbackId: string): Promise<Feedback | undefined> {
    const deleted = await FeedbackModel.findOneAndDelete({ _id: feedbackId }).lean();
    if (deleted) {
      await this.recalculateTeacherStats(deleted.teacherId);
    }
    return deleted ? withId<Feedback>(deleted) : undefined;
  }

  async getFlaggedFeedback(abusiveWords: string[]): Promise<Array<Feedback & { teacherName?: string; department?: string }>> {
    const all = await FeedbackModel.find({}).sort({ createdAt: -1 }).lean();
    const flagged = all.filter((fb: any) => {
      if (!fb.comment) return false;
      const lower = fb.comment.toLowerCase();
      return abusiveWords.some((w) => lower.includes(w));
    });

    const teacherIds = flagged.map((f: any) => f.teacherId);
    const teacherMap = new Map(
      (await TeacherModel.find({ _id: { $in: teacherIds } }).lean()).map((t: any) => [t._id.toString(), t]),
    );

    return flagged.map((fb: any) => ({
      ...withId<Feedback>(fb),
      teacherName: teacherMap.get(fb.teacherId)?.name,
      department: teacherMap.get(fb.teacherId)?.department,
    }));
  }

  async getOverdueDoubts(days: number): Promise<Array<Doubt & { teacherName?: string; department?: string }>> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const overdue = await DoubtModel.find({
      status: "open",
      createdAt: { $lte: cutoff },
    })
      .sort({ createdAt: -1 })
      .lean();

    const teacherIds = overdue.map((d) => d.teacherId);
    const teachersMap = new Map(
      (await TeacherModel.find({ _id: { $in: teacherIds } }).lean()).map((t: any) => [t._id.toString(), t]),
    );

    return overdue.map((d: any) => ({
      ...withId<Doubt>(d),
      teacherName: teachersMap.get(d.teacherId)?.name,
      department: teachersMap.get(d.teacherId)?.department,
    }));
  }

  async createDoubt(doubtData: Omit<InsertDoubt, "teacherId" | "studentId" | "studentName"> & { teacherId: string; studentId: string; studentName: string }): Promise<Doubt> {
    const created = await DoubtModel.create(doubtData);
    return withId<Doubt>(created);
  }

  async getDoubtsByTeacher(teacherId: string): Promise<Doubt[]> {
    const rows = await DoubtModel.find({ teacherId }).sort({ createdAt: -1 }).lean();
    return rows.map((r) => withId<Doubt>(r));
  }

  async getDoubtsByStudent(studentId: string): Promise<Doubt[]> {
    const rows = await DoubtModel.find({ studentId }).sort({ createdAt: -1 }).lean();
    return rows.map((r) => withId<Doubt>(r));
  }

  async answerDoubt(doubtId: string, answer: string): Promise<Doubt> {
    const updated = await DoubtModel.findOneAndUpdate(
      { _id: doubtId },
      {
        answer,
        status: "answered",
        answeredAt: new Date(),
      },
      { new: true },
    ).lean();

    if (!updated) throw new Error("Doubt not found");
    return withId<Doubt>(updated);
  }

  async listStudyGroups(): Promise<StudyGroup[]> {
    const rows = await StudyGroupModel.find({}).sort({ createdAt: -1 }).lean();
    return rows.map((r: any) => ({ ...r, id: (r._id || r.id)?.toString?.() ?? r._id ?? r.id }));
  }

  async listMyStudyGroups(userId: string): Promise<StudyGroup[]> {
    const rows = await StudyGroupModel.find({
      $or: [{ creatorId: userId }, { "members.id": userId }],
    })
      .sort({ lastActivity: -1, createdAt: -1 })
      .lean();
    return rows.map((r: any) => ({ ...r, id: (r._id || r.id)?.toString?.() ?? r._id ?? r.id }));
  }

  async createStudyGroup(data: {
    name: string;
    description?: string;
    subject: string;
    creatorId: string;
    creatorName: string;
    maxMembers?: number;
    isPrivate?: boolean;
    tags?: string[];
  }): Promise<StudyGroup> {
    const created = await StudyGroupModel.create({
      name: data.name,
      description: data.description || "",
      subject: data.subject,
      creatorId: data.creatorId,
      creatorName: data.creatorName,
      maxMembers: typeof data.maxMembers === "number" ? data.maxMembers : 10,
      isPrivate: !!data.isPrivate,
      tags: Array.isArray(data.tags) ? data.tags : [],
      members: [{ id: data.creatorId, name: data.creatorName, joinedAt: new Date() }],
      lastActivity: new Date(),
    });
    return withId<StudyGroup>(created);
  }

  async joinStudyGroup(groupId: string, user: { id: string; name: string }): Promise<StudyGroup> {
    const group = await StudyGroupModel.findById(groupId).lean();
    if (!group) throw new Error("Study group not found");

    const members = Array.isArray((group as any).members) ? (group as any).members : [];
    if (members.some((m: any) => m?.id === user.id)) {
      return { ...(group as any), id: (group as any)._id?.toString?.() ?? (group as any).id } as StudyGroup;
    }

    const maxMembers = typeof (group as any).maxMembers === "number" ? (group as any).maxMembers : 10;
    if (members.length >= maxMembers) {
      throw new Error("Group is full");
    }

    const updated = await StudyGroupModel.findOneAndUpdate(
      { _id: groupId, "members.id": { $ne: user.id } },
      {
        $push: { members: { id: user.id, name: user.name, joinedAt: new Date() } },
        $set: { lastActivity: new Date() },
      },
      { new: true },
    ).lean();

    if (!updated) {
      const latest = await StudyGroupModel.findById(groupId).lean();
      if (!latest) throw new Error("Study group not found");
      return { ...(latest as any), id: (latest as any)._id?.toString?.() ?? (latest as any).id } as StudyGroup;
    }

    return { ...(updated as any), id: (updated as any)._id?.toString?.() ?? (updated as any).id } as StudyGroup;
  }

  async getStudentGamification(userId: string) {
    const totalFeedback = await FeedbackModel.countDocuments({ studentId: userId });

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const weeklyProgress = await FeedbackModel.countDocuments({ studentId: userId, createdAt: { $gte: startOfWeek } });

    const weeklyGoal = 5;
    const points = totalFeedback * 20 + weeklyProgress * 5;
    const level = Math.max(1, Math.floor(points / 100) + 1);
    const nextLevelPoints = 100;

    // Simple streak: consecutive days with feedback ending today.
    const recent = await FeedbackModel.find({ studentId: userId })
      .sort({ createdAt: -1 })
      .select("createdAt")
      .limit(60)
      .lean();
    const days = new Set<string>(
      recent
        .map((r: any) => (r.createdAt ? new Date(r.createdAt) : null))
        .filter((d: Date | null): d is Date => d instanceof Date && !isNaN(d.getTime()))
        .map((d) => d.toISOString().slice(0, 10)),
    );
    let streak = 0;
    const cursor = new Date(now);
    cursor.setHours(0, 0, 0, 0);
    while (true) {
      const key = cursor.toISOString().slice(0, 10);
      if (!days.has(key)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    const achievementDefs = [
      {
        id: "first_feedback",
        title: "First Feedback",
        description: "Submit your first feedback",
        icon: "trophy",
        points: 50,
        category: "feedback",
        unlocked: totalFeedback >= 1,
      },
      {
        id: "five_feedback",
        title: "High Five",
        description: "Submit 5 feedback entries",
        icon: "star",
        points: 100,
        category: "feedback",
        unlocked: totalFeedback >= 5,
      },
      {
        id: "weekly_goal",
        title: "Weekly Winner",
        description: "Complete your weekly feedback goal",
        icon: "target",
        points: 150,
        category: "engagement",
        unlocked: weeklyProgress >= weeklyGoal,
      },
      {
        id: "streak_3",
        title: "On a Roll",
        description: "3-day feedback streak",
        icon: "zap",
        points: 120,
        category: "engagement",
        unlocked: streak >= 3,
      },
    ];

    const claims = await StudentAchievementClaimModel.find({ studentId: userId }).lean();
    const claimMap = new Map<string, any>(claims.map((c: any) => [c.achievementId, c]));
    const achievements = achievementDefs.map((a) => ({
      ...a,
      unlockedAt: claimMap.get(a.id)?.unlockedAt ? new Date(claimMap.get(a.id).unlockedAt).toISOString() : undefined,
    }));

    // Leaderboard (by points) is approximate: rank among students based on feedback counts.
    const totals = await FeedbackModel.aggregate([
      { $group: { _id: "$studentId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const totalStudents = totals.length;
    const rank = totals.findIndex((r: any) => r._id === userId) + 1;
    const leaderboard = totalStudents > 0 && rank > 0 ? { rank, totalStudents } : undefined;

    return {
      level,
      points,
      nextLevelPoints,
      streak,
      totalFeedback,
      weeklyGoal,
      weeklyProgress,
      achievements,
      leaderboard,
    };
  }

  async claimStudentAchievement(userId: string, achievementId: string): Promise<{ ok: true; unlockedAt: Date }> {
    const unlockedAt = new Date();
    await StudentAchievementClaimModel.updateOne(
      { studentId: userId, achievementId },
      { studentId: userId, achievementId, unlockedAt, claimedAt: new Date() },
      { upsert: true },
    );
    return { ok: true, unlockedAt };
  }

  async getFavoritesByStudent(studentId: string): Promise<Favorite[]> {
    const rows = await FavoriteModel.find({ studentId }).sort({ createdAt: -1 }).lean();
    return rows.map((r) => withId<Favorite>(r));
  }

  async addFavorite(studentId: string, teacherId: string): Promise<Favorite> {
    const existing = await FavoriteModel.findOne({ studentId, teacherId }).lean();
    if (existing) return withId<Favorite>(existing);
    const fav = await FavoriteModel.create({ studentId, teacherId });
    return withId<Favorite>(fav);
  }

  async removeFavorite(studentId: string, teacherId: string): Promise<void> {
    await FavoriteModel.deleteOne({ studentId, teacherId });
  }

  async saveFeedbackAnalysis(data: {
    feedbackId: string;
    sentiment: string;
    sentimentScore: number;
    qualityScore: number;
    keywords: string;
  }): Promise<void> {
    await FeedbackAnalysisModel.updateOne(
      { feedbackId: data.feedbackId },
      {
        feedbackId: data.feedbackId,
        sentiment: data.sentiment,
        sentimentScore: data.sentimentScore,
        qualityScore: data.qualityScore,
        keywords: data.keywords,
        analyzedAt: new Date(),
      },
      { upsert: true },
    );
  }

  async getFeedbackAnalysis(feedbackId: string): Promise<FeedbackAnalysis | undefined> {
    const analysis = await FeedbackAnalysisModel.findOne({ feedbackId }).lean();
    return analysis ? withId<FeedbackAnalysis>(analysis) : undefined;
  }

  async saveTeacherSummary(data: {
    teacherId: string;
    summary: string;
    strengths: string;
    improvements: string;
  }): Promise<void> {
    await TeacherSummaryModel.create(data);
  }

  async getLatestTeacherSummary(teacherId: string): Promise<TeacherSummary | undefined> {
    const summary = await TeacherSummaryModel.findOne({ teacherId })
      .sort({ generatedAt: -1 })
      .lean();
    return summary ? withId<TeacherSummary>(summary) : undefined;
  }

  async saveChatMessage(data: {
    userId?: string;
    message: string;
    response: string;
  }): Promise<void> {
    await ChatHistoryModel.create({
      userId: data.userId || null,
      message: data.message,
      response: data.response,
    });
  }

  async getChatHistory(userId: string, limit: number = 10): Promise<ChatHistory[]> {
    const rows = await ChatHistoryModel.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
    return rows.map((r) => withId<ChatHistory>(r));
  }

  private async recalculateTeacherStats(teacherId: string) {
    const agg = await FeedbackModel.aggregate([
      { $match: { teacherId } },
      {
        $group: {
          _id: "$teacherId",
          count: { $sum: 1 },
          avgRating: { $avg: "$rating" },
        },
      },
    ]);
    const stats = agg[0];
    await TeacherModel.updateOne(
      { _id: teacherId },
      {
        averageRating: stats ? stats.avgRating : 0,
        totalFeedback: stats ? stats.count : 0,
      },
    );
  }
}

export const storage = new DatabaseStorage();
