import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Star, Users, MessageSquare, TrendingUp, Award, Calendar, Edit, Clock, Mail, BookOpen, User, BarChart3, Activity, Target, Zap, ThumbsUp, QrCode } from "lucide-react";
import { SkillBadges } from "@/components/SkillBadges";
import { RatingProgress } from "@/components/ProgressBar";
import { FeedbackDetailModal } from "@/components/FeedbackDetailModal";
import { TeacherAISummary } from "@/components/TeacherAISummary";
import { useAuth } from "@/contexts/AuthContext";
import type { Teacher, Feedback } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface TeacherStats {
  averageRating: number;
  totalFeedback: number;
  totalStudents: number;
  ratingDistribution: { rating: number; count: number }[];
  feedbackList: Feedback[];
}

interface FeedbackSummaryResponse {
  total: number;
  averageRating: number;
  positiveCount: number;
  uniqueStudents: number;
  avgCommentLength: number;
  ratingDistribution: Array<{ rating: number; count: number }>;
  ratingTrend: number;
}

interface FeedbackPagedResponse {
  items: Feedback[];
  total: number;
  page: number;
  limit: number;
}

interface OfficeSlot {
  id: string;
  teacherId: string;
  startTime: string;
  endTime: string;
  status: string;
}

interface OfficeBooking {
  id: string;
  slotId: string;
  studentId: string;
  status: string;
  slot?: OfficeSlot | null;
}

export default function TeacherProfile() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const [slotForm, setSlotForm] = useState({ startTime: "", endTime: "" });

  const { data: teacher, isLoading: teacherLoading } = useQuery<Teacher>({
    queryKey: [`/api/teachers/${id}`],
  });

  const teacherIdForLink = teacher?.id ?? id ?? "";

  const { data: feedbackSummary } = useQuery<FeedbackSummaryResponse>({
    queryKey: [`/api/feedback/teacher/${id}/summary`],
    enabled: !!id,
  });

  const FEEDBACK_PAGE_SIZE = 20;
  const [feedbackPage, setFeedbackPage] = useState(1);
  const [loadedFeedback, setLoadedFeedback] = useState<Feedback[]>([]);
  const [filterRating, setFilterRating] = useState<string>("all");
  const [filterHasComment, setFilterHasComment] = useState(false);
  const [sortBy, setSortBy] = useState("newest");

  useEffect(() => {
    setFeedbackPage(1);
    setLoadedFeedback([]);
  }, [id, filterRating, filterHasComment, sortBy]);

  const feedbackPageUrl = id
    ? `/api/feedback/teacher/${id}/paged?page=${feedbackPage}&limit=${FEEDBACK_PAGE_SIZE}&minRating=${filterRating === 'all' ? '' : filterRating}&hasComment=${filterHasComment}&sortBy=${sortBy}`
    : "";

  const {
    data: feedbackPageData,
    isLoading: feedbackPageLoading,
    isFetching: feedbackPageFetching,
  } = useQuery<FeedbackPagedResponse>({
    queryKey: [feedbackPageUrl],
    enabled: !!id,
  });

  useEffect(() => {
    if (!feedbackPageData?.items?.length) return;
    setLoadedFeedback((prev) => {
      const existing = new Set(prev.map((f) => f.id));
      const next = feedbackPageData.items.filter((f) => !existing.has(f.id));
      return next.length > 0 ? [...prev, ...next] : prev;
    });
  }, [feedbackPageData]);

  const { data: slots = [] } = useQuery<OfficeSlot[]>({
    queryKey: [`/api/office/slots/${id}`],
  });

  const { data: myBookings = [] } = useQuery<OfficeBooking[]>({
    queryKey: ["/api/office/bookings/my"],
    enabled: user?.role === "student",
  });

  const createSlotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/office/slots", {
        startTime: slotForm.startTime,
        endTime: slotForm.endTime,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/office/slots/${id}`] });
      setSlotForm({ startTime: "", endTime: "" });
      toast({ title: "Slot created" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create slot", description: error.message, variant: "destructive" });
    },
  });

  const bookSlotMutation = useMutation({
    mutationFn: async (slotId: string) => {
      const res = await apiRequest("POST", `/api/office/slots/${slotId}/book`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/office/slots/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/office/bookings/my"] });
      toast({ title: "Slot booked" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to book slot", description: error.message, variant: "destructive" });
    },
  });

  const cancelBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await apiRequest("POST", `/api/office/bookings/${bookingId}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/office/slots/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/office/bookings/my"] });
      toast({ title: "Booking canceled" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to cancel booking", description: error.message, variant: "destructive" });
    },
  });

  const totalFeedbackCount =
    feedbackSummary?.total ?? teacher?.totalFeedback ?? feedbackPageData?.total ?? loadedFeedback.length;

  const ratingDistribution =
    feedbackSummary?.ratingDistribution?.length === 5
      ? feedbackSummary.ratingDistribution
      : [5, 4, 3, 2, 1].map((rating) => ({
          rating,
          count: loadedFeedback.filter((f) => f.rating === rating).length,
        }));

  const uniqueStudents = feedbackSummary?.uniqueStudents ?? new Set(loadedFeedback.map((f) => f.studentId)).size;
  const averageRating =
    feedbackSummary?.averageRating ??
    teacher?.averageRating ??
    (loadedFeedback.length > 0 ? loadedFeedback.reduce((sum, f) => sum + f.rating, 0) / loadedFeedback.length : 0);

  const positiveFeedbackCount = feedbackSummary?.positiveCount ?? loadedFeedback.filter((f) => f.rating >= 4).length;
  const positiveFeedbackRate = totalFeedbackCount > 0 ? (positiveFeedbackCount / totalFeedbackCount) * 100 : 0;

  const ratingTrend = feedbackSummary?.ratingTrend ?? 0;

  const responseRate = 0;

  const avgCommentLength =
    feedbackSummary?.avgCommentLength ??
    (() => {
      const commentsWithText = loadedFeedback.filter((f) => f.comment && f.comment.length > 0);
      return commentsWithText.length > 0
        ? commentsWithText.reduce((sum, f) => sum + (f.comment?.length || 0), 0) / commentsWithText.length
        : 0;
    })();

  if (teacherLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!teacher) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Teacher not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleFeedbackClick = (feedback: Feedback) => {
    setSelectedFeedback(feedback);
    setIsModalOpen(true);
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-8 animate-fadeIn" style={{ animationDuration: '0.4s' }}>
      {/* Header Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card className="h-full hover-lift transition-bounce">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <Avatar className="h-20 w-20">
                    {teacher.profileImage && (
                      <AvatarImage src={teacher.profileImage} alt={teacher.name ?? "Teacher"} />
                    )}
                    <AvatarFallback className="bg-primary/10 text-primary text-xl">
                      {(teacher.name ?? "")
                        .trim()
                        .split(/\s+/)
                        .filter(Boolean)
                        .map((n) => n[0])
                        .join("") || "T"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-2 flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-3xl">{teacher.name ?? "Teacher"}</CardTitle>
                        <CardDescription className="text-base">
                          {teacher.subject} • {teacher.department}
                        </CardDescription>
                      </div>
                      {(user?.role === "admin" || user?.role === "teacher") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/teacher/${id}/edit`)}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Profile
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                      <span className="text-2xl font-bold">{averageRating.toFixed(1)}</span>
                      <span className="text-sm text-muted-foreground">({totalFeedbackCount} reviews)</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            {(teacher.bio || teacher.officeHours || teacher.contactInfo || teacher.teachingPhilosophy) && (
              <CardContent className="space-y-4 pt-4">
                {teacher.bio && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">About</h3>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{teacher.bio}</p>
                  </div>
                )}
                {teacher.officeHours && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">Office Hours</h3>
                    </div>
                    <p className="text-sm text-foreground">{teacher.officeHours}</p>
                  </div>
                )}
                {teacher.contactInfo && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">Contact</h3>
                    </div>
                    <p className="text-sm text-foreground">{teacher.contactInfo}</p>
                  </div>
                )}
                {teacher.teachingPhilosophy && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">Teaching Philosophy</h3>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{teacher.teachingPhilosophy}</p>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>

        {/* Enhanced Stats Cards */}
        <div className="space-y-4">
          <Card className="hover-lift animate-slideInDown">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <QrCode className="h-4 w-4" />
                QR Quick Feedback Link
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-2">
                Share this link as a QR code or short URL so students can give fast feedback for this teacher without logging in.
              </p>
              <div className="rounded-md border border-dashed border-muted p-2 bg-muted/30">
                <p className="text-[11px] break-all font-mono">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/api/qr-feedback/${teacherIdForLink}`
                    : `/api/qr-feedback/${teacherIdForLink}`}
                </p>
              </div>
              <div className="mt-3">
                <p className="text-3xl font-bold animate-fadeScale">{totalFeedbackCount}</p>
                <p className="text-xs text-muted-foreground">total submissions</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift animate-slideInDown" style={{ animationDelay: "0.2s" }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ThumbsUp className="h-4 w-4" />
                Positive Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold animate-fadeScale">{positiveFeedbackRate.toFixed(0)}%</p>
              <p className="text-xs text-muted-foreground">{positiveFeedbackCount} of {totalFeedbackCount} positive</p>
            </CardContent>
          </Card>

          {totalFeedbackCount > 0 && (
            <Card className="hover-lift animate-slideInDown" style={{ animationDelay: "0.3s" }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className={`h-4 w-4 ${ratingTrend >= 0 ? 'text-green-500' : 'text-red-500'}`} />
                  Rating Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <p className={`text-2xl font-bold ${ratingTrend >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {ratingTrend >= 0 ? '+' : ''}{ratingTrend.toFixed(2)}
                  </p>
                  <TrendingUp className={`h-4 w-4 ${ratingTrend >= 0 ? 'text-green-500 rotate-0' : 'text-red-500 rotate-180'}`} />
                </div>
                <p className="text-xs text-muted-foreground">vs. previous period</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Achievement Badges */}
      <Card className="hover-lift animate-slideInUp">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Achievements & Badges
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SkillBadges 
            averageRating={averageRating}
            totalFeedback={totalFeedbackCount}
            totalStudents={uniqueStudents}
          />
        </CardContent>
      </Card>

      {/* Rating Progress */}
      <Card className="hover-lift animate-slideInUp" style={{ animationDelay: "0.1s" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Rating Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RatingProgress 
            currentRating={averageRating}
            totalReviews={totalFeedbackCount}
          />
        </CardContent>
      </Card>

      {/* Enhanced Rating Distribution */}
      <Card className="hover-lift animate-slideInUp" style={{ animationDelay: "0.2s" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Rating Distribution
          </CardTitle>
          <CardDescription>Breakdown of all ratings received</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {ratingDistribution.map(({ rating, count }, index) => {
              const percentage = totalFeedbackCount > 0 ? (count / totalFeedbackCount) * 100 : 0;
              return (
                <div 
                  key={rating} 
                  className="flex items-center gap-4 animate-slideInUp hover-scale transition-bounce" 
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="flex items-center gap-1 w-24">
                    {[...Array(rating)].map((_, i) => (
                      <Star 
                        key={i} 
                        className="h-4 w-4 fill-yellow-400 text-yellow-400 animate-scaleIn" 
                        style={{ animationDelay: `${index * 0.05 + i * 0.02}s` }}
                      />
                    ))}
                    {[...Array(5 - rating)].map((_, i) => (
                      <Star key={`empty-${i}`} className="h-4 w-4 text-gray-300" />
                    ))}
                  </div>
                  <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden relative">
                    <div
                      className="bg-gradient-to-r from-blue-500 via-emerald-500 to-pink-500 h-full progress-animate transition-all duration-700 ease-out"
                      style={{
                        width: `${percentage}%`,
                      }}
                    />
                    {percentage > 0 && (
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                    )}
                  </div>
                  <div className="w-16 text-right">
                    <span className="font-semibold text-lg">{count}</span>
                    <p className="text-xs text-muted-foreground">
                      {percentage.toFixed(1)}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Summary Stats */}
          {totalFeedbackCount > 0 && (
            <div className="mt-6 pt-6 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg animate-fadeScale">
                <p className="text-2xl font-bold text-green-600">{ratingDistribution[0]?.count || 0}</p>
                <p className="text-xs text-muted-foreground">5 Stars</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg animate-fadeScale" style={{ animationDelay: "0.1s" }}>
                <p className="text-2xl font-bold text-blue-600">{ratingDistribution[1]?.count || 0}</p>
                <p className="text-xs text-muted-foreground">4 Stars</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg animate-fadeScale" style={{ animationDelay: "0.2s" }}>
                <p className="text-2xl font-bold text-yellow-600">{ratingDistribution[2]?.count || 0}</p>
                <p className="text-xs text-muted-foreground">3 Stars</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg animate-fadeScale" style={{ animationDelay: "0.3s" }}>
                <p className="text-2xl font-bold text-orange-600">{(ratingDistribution[3]?.count || 0) + (ratingDistribution[4]?.count || 0)}</p>
                <p className="text-xs text-muted-foreground">1-2 Stars</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      {totalFeedbackCount > 0 && (
        <Card className="hover-lift animate-slideInUp" style={{ animationDelay: "0.25s" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Performance Metrics
            </CardTitle>
            <CardDescription>Detailed performance insights</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-lg border border-blue-200 dark:border-blue-800 animate-fadeScale">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Response Rate</span>
                  <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{responseRate.toFixed(0)}%</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  {Math.round((responseRate / 100) * totalFeedbackCount)} of {totalFeedbackCount} responded
                </p>
              </div>
              
              <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 rounded-lg border border-green-200 dark:border-green-800 animate-fadeScale" style={{ animationDelay: "0.1s" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">Avg Comment Length</span>
                  <Zap className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-2xl font-bold text-green-900 dark:text-green-100">{Math.round(avgCommentLength)}</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">characters per comment</p>
              </div>
              
              <div className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900 rounded-lg border border-emerald-200 dark:border-emerald-800 animate-fadeScale" style={{ animationDelay: "0.2s" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Engagement Score</span>
                  <Activity className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                </div>
                <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                  {Math.round((averageRating * 20) + (positiveFeedbackRate * 0.3) + (responseRate * 0.2))}
                </p>
                <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-1">out of 100</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI-Generated Summary */}
      {totalFeedbackCount > 0 && (
        <div className="animate-slideInUp" style={{ animationDelay: "0.28s" }}>
          <TeacherAISummary teacherId={id!} />
        </div>
      )}

      {/* Recent Feedback */}
      <Card className="hover-lift animate-slideInUp" style={{ animationDelay: "0.3s" }}>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Student Feedback
              </CardTitle>
              <CardDescription>Click on a feedback to view full details</CardDescription>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-2">
                 <Checkbox 
                  id="has-comment" 
                  checked={filterHasComment}
                  onCheckedChange={(checked) => setFilterHasComment(!!checked)}
                />
                <Label htmlFor="has-comment" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  With comments
                </Label>
              </div>

              <Select value={filterRating} onValueChange={setFilterRating}>
                <SelectTrigger className="w-[130px] h-9">
                  <SelectValue placeholder="Rating" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ratings</SelectItem>
                  <SelectItem value="5">5 Stars</SelectItem>
                  <SelectItem value="4">4 Stars & Up</SelectItem>
                  <SelectItem value="3">3 Stars & Up</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[130px] h-9">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="rating-desc">Highest Rated</SelectItem>
                  <SelectItem value="rating-asc">Lowest Rated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
            {totalFeedbackCount === 0 ? (
              <div className="text-center py-8 animate-fadeIn">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-2 opacity-50" />
                <p className="text-muted-foreground">No feedback yet</p>
              </div>
            ) : feedbackPageLoading && loadedFeedback.length === 0 ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="border rounded-lg p-4">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-28 mt-2" />
                    <Skeleton className="h-3 w-full mt-3" />
                  </div>
                ))}
              </div>
            ) : (
              loadedFeedback.map((feedback, index) => (
                <div
                  key={feedback.id}
                  className="border rounded-lg p-4 hover-lift cursor-pointer animate-slideInUp group"
                  style={{ animationDelay: `${index * 0.05}s` }}
                  onClick={() => handleFeedbackClick(feedback)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium group-hover:text-primary transition-colors">{feedback.studentName}</p>
                      </div>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {feedback.createdAt ? new Date(feedback.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        }) : 'N/A'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {[...Array(feedback.rating)].map((_, i) => (
                        <Star 
                          key={i} 
                          className="h-4 w-4 fill-yellow-400 text-yellow-400 animate-scaleIn" 
                          style={{ animationDelay: `${i * 0.05}s` }}
                        />
                      ))}
                    </div>
                  </div>
                  {feedback.comment && (
                    <p className="mt-2 text-sm text-foreground line-clamp-2 group-hover:text-foreground/90 transition-colors">
                      {feedback.comment}
                    </p>
                  )}
                  {feedback.subject && (
                    <Badge variant="outline" className="mt-2 hover-scale">{feedback.subject}</Badge>
                  )}
                </div>
              ))
            )}
          </div>
          {loadedFeedback.length < totalFeedbackCount && (
            <Button
              variant="outline"
              className="w-full mt-4 hover-lift"
              disabled={feedbackPageFetching}
              onClick={() => setFeedbackPage((p) => p + 1)}
            >
              Load More ({loadedFeedback.length}/{totalFeedbackCount})
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Analytics Link */}
      <Card className="hover-lift">
        <CardContent className="pt-6">
          <Button
            variant="outline"
            className="w-full hover-lift"
            onClick={() => navigate(`/analytics/${id}`)}
          >
            <TrendingUp className="h-4 w-4 mr-2 animate-float" />
            View Advanced Analytics
          </Button>
        </CardContent>
      </Card>

      {/* Feedback Detail Modal */}
      <FeedbackDetailModal
        feedback={selectedFeedback}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}
