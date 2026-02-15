import { useMemo, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { FeedbackItem } from "@/components/FeedbackItem";
import { RatingChart } from "@/components/RatingChart";
import { TeacherInsightsPanel } from "@/components/TeacherInsightsPanel";
import { SearchFilter } from "@/components/SearchFilter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Star, TrendingUp, Users, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { Feedback } from "@shared/schema";

interface FeedbackWithTeacher extends Feedback {
  teacherName?: string;
}

interface DoubtItem {
  id: string;
  teacherId: string;
  teacherName?: string;
  studentId: string;
  studentName: string;
  question: string;
  answer?: string | null;
  status: string;
  createdAt?: string;
  answeredAt?: string | null;
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [filterRating, setFilterRating] = useState<number | null>(null);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});

  const [page, setPage] = useState(1);
  const limit = 10;

  const { data: feedbackData, isLoading, error } = useQuery<{
    items: FeedbackWithTeacher[];
    total: number;
    page: number;
    limit: number;
  }>({
    queryKey: ["/api/feedback/received", page, limit, searchQuery, sortBy, filterRating],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        search: searchQuery,
        sortBy: sortBy,
      });
      if (filterRating) params.append("minRating", filterRating.toString());
      const res = await apiRequest("GET", `/api/feedback/received?${params}`);
      return res.json();
    },
  });

  const feedback = feedbackData?.items || [];
  const totalFeedback = feedbackData?.total || 0;
  const totalPages = Math.ceil(totalFeedback / limit);

  const { data: doubts = [] } = useQuery<DoubtItem[]>({
    queryKey: ["/api/doubts/teacher"],
  });

  const { data: improvementData } = useQuery<{
    hasData: boolean;
    improvement: number;
    recentAverage: number | null;
    previousAverage: number | null;
  }>({
    queryKey: user?.id ? [`/api/analytics/teacher/${user.id}/improvement`] : [],
    enabled: !!user?.id,
  });

  const answerMutation = useMutation({
    mutationFn: async ({ id, answer }: { id: string; answer: string }) => {
      const res = await apiRequest("POST", `/api/doubts/${id}/answer`, { answer });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/doubts/teacher"] });
    },
  });

  const pageFeedbackCount = feedback.length;
  const averageRating = pageFeedbackCount > 0 
    ? feedback.reduce((sum, f) => sum + f.rating, 0) / pageFeedbackCount 
    : 0;
  const uniqueStudents = new Set(feedback.map((f) => f.studentName)).size;

  const openDoubts = doubts.filter((d) => d.status !== "answered").length;
  const answeredDoubts = doubts.filter((d) => d.status === "answered").length;

  const ratingDistribution = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    feedback.forEach(f => {
      if (f.rating >= 1 && f.rating <= 5) {
        counts[f.rating - 1]++;
      }
    });
    return [
      { rating: 1, count: counts[0] },
      { rating: 2, count: counts[1] },
      { rating: 3, count: counts[2] },
      { rating: 4, count: counts[3] },
      { rating: 5, count: counts[4] },
    ];
  }, [feedback]);

  const filteredFeedback = useMemo(() => {
    let result = [...feedback];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (f) =>
          f.studentName.toLowerCase().includes(query) ||
          (f.comment || "").toLowerCase().includes(query) ||
          (f.subject || "").toLowerCase().includes(query)
      );
    }

    if (filterRating) {
      result = result.filter((f) => f.rating >= filterRating);
    }

    result.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      switch (sortBy) {
        case "recent":
          return dateB - dateA;
        case "oldest":
          return dateA - dateB;
        case "rating-high":
          return b.rating - a.rating;
        case "rating-low":
          return a.rating - b.rating;
        default:
          return 0;
      }
    });

    return result;
  }, [feedback, searchQuery, sortBy, filterRating]);

  const sortedDoubts = useMemo(() => {
    const copy = [...doubts];
    copy.sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return db - da;
    });
    return copy;
  }, [doubts]);

  const aiReplyMutation = useMutation({
    mutationFn: async ({ question }: { question: string }) => {
      const res = await apiRequest("POST", "/api/ai/reply-templates", { comment: question });
      return res.json() as Promise<{ templates?: string[] }>;
    },
  });

  const resolvedCount = feedback.filter((f) => f.resolvedAt).length;
  const unreadCount = feedback.filter((f) => !f.readAt).length;

  const improvementValue =
    improvementData && improvementData.hasData
      ? improvementData.improvement.toFixed(2)
      : "N/A";

  const improvementSubtitle =
    improvementData && improvementData.hasData
      ? "Last 30 days vs previous"
      : "Not enough recent data";

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="container px-4 md:px-6 py-8">
          <div className="mb-8">
            <Skeleton className="h-9 w-64 mb-2" />
            <Skeleton className="h-5 w-48" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="container px-4 md:px-6 py-8">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-2">Failed to load feedback</h2>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error ? error.message : "Unable to fetch feedback. Please check your connection and try again."}
            </p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/feedback/received"] })}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="container px-4 md:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" data-testid="text-welcome-teacher">Welcome, {user?.name || "Teacher"}</h1>
          <p className="text-muted-foreground mt-1">
            Track your feedback and performance analytics
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Total Feedback"
            value={totalFeedback}
            subtitle="All time"
            icon={MessageSquare}
          />
          <StatCard
            title="Average Rating"
            value={averageRating.toFixed(1)}
            subtitle="Out of 5 stars"
            icon={Star}
          />
          <StatCard
            title="Unique Students"
            value={uniqueStudents}
            subtitle="Who gave feedback"
            icon={Users}
          />
          <StatCard
            title="Open Doubts"
            value={openDoubts}
            subtitle={`${answeredDoubts} answered`}
            icon={MessageSquare}
          />
          <StatCard
            title="Unread Feedback"
            value={unreadCount}
            subtitle="Need your attention"
            icon={AlertCircle}
          />
          <StatCard
            title="Resolved Feedback"
            value={resolvedCount}
            subtitle="Marked as addressed"
            icon={CheckCircle2}
          />
          <StatCard
            title="Rating Improvement"
            value={improvementValue}
            subtitle={improvementSubtitle}
            icon={TrendingUp}
          />
        </div>

        <Tabs defaultValue="feedback" className="space-y-6">
          <TabsList>
            <TabsTrigger value="feedback" data-testid="tab-feedback">Feedback</TabsTrigger>
            <TabsTrigger value="doubts" data-testid="tab-doubts">Doubt Wall</TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="feedback" className="space-y-6">
            <SearchFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              sortBy={sortBy}
              onSortChange={setSortBy}
              filterRating={filterRating}
              onFilterRatingChange={setFilterRating}
              placeholder="Search feedback by student or content..."
            />

            <div className="space-y-4">
              {filteredFeedback.map((item) => (
                <FeedbackItem 
                  key={item.id} 
                  feedback={{
                    id: item.id,
                    studentName: item.studentName,
                    rating: item.rating,
                    comment: item.comment || "",
                    createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
                    subject: item.subject || undefined,
                    qualityScore: (item as any).qualityScore,
                    commentLength: (item as any).commentLength,
                    hasComment: (item as any).hasComment,
                  }} 
                />
              ))}
            </div>

            {filteredFeedback.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground" data-testid="text-no-feedback">
                  {feedback.length === 0 && !searchQuery
                    ? "No feedback received yet. Feedback from students will appear here." 
                    : "No feedback found matching your criteria."}
                </p>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="doubts" className="space-y-6">
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span>
                <span className="font-semibold text-foreground">{openDoubts}</span> open doubts
              </span>
              <span>
                <span className="font-semibold text-foreground">{answeredDoubts}</span> answered
              </span>
              <span>
                <span className="font-semibold text-foreground">{doubts.length}</span> total
              </span>
            </div>

            <div className="space-y-4">
              {sortedDoubts.map((doubt) => (
                <Card key={doubt.id} className="border-l-4 border-l-sky-500">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>{doubt.studentName}</span>
                      <span className="text-xs text-muted-foreground">
                        {doubt.status === "answered" ? "Answered" : "Open"}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">Question</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap mt-1">{doubt.question}</p>
                    </div>
                    {doubt.answer && (
                      <div className="rounded-md bg-muted p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Your Answer</p>
                        <p className="text-sm whitespace-pre-wrap">{doubt.answer}</p>
                      </div>
                    )}
                    {!doubt.answer && (
                      <div className="space-y-2">
                        <textarea
                          className="w-full min-h-[60px] text-sm rounded-md border border-input bg-background px-3 py-2"
                          placeholder="Type your answer..."
                          value={answerDrafts[doubt.id] || ""}
                          onChange={(e) =>
                            setAnswerDrafts((prev) => ({ ...prev, [doubt.id]: e.target.value }))
                          }
                        />
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
                            onClick={async () => {
                              if (!doubt.question?.trim()) return;
                              try {
                                const data = await aiReplyMutation.mutateAsync({ question: doubt.question });
                                const first = (data.templates || []).find((t) => typeof t === "string" && t.trim().length > 0);
                                if (!first) {
                                  alert("AI could not generate a reply suggestion. Please try again later.");
                                  return;
                                }
                                setAnswerDrafts((prev) => ({ ...prev, [doubt.id]: first.trim() }));
                              } catch (error: any) {
                                console.error("AI reply suggestion error:", error);
                                alert(error?.message || "Failed to generate AI reply suggestion");
                              }
                            }}
                            disabled={aiReplyMutation.isPending}
                          >
                            <Sparkles className="h-3 w-3" />
                            {aiReplyMutation.isPending ? "Generating..." : "Suggest reply with AI"}
                          </button>

                          <button
                            type="button"
                            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            onClick={() =>
                              answerMutation.mutate({ id: doubt.id, answer: (answerDrafts[doubt.id] || "").trim() })
                            }
                            disabled={answerMutation.isPending || !(answerDrafts[doubt.id] || "").trim()}
                          >
                            {answerMutation.isPending ? "Sending..." : "Send Answer"}
                          </button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {sortedDoubts.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  No doubts have been posted yet. When students submit doubts with their feedback, they will appear here.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 space-y-6">
                <RatingChart data={ratingDistribution} />

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg font-medium">Performance Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {ratingDistribution.slice().reverse().map((item) => (
                      <div key={item.rating} className="flex items-center justify-between py-2 border-b last:border-0">
                        <span className="text-sm text-muted-foreground">{item.rating}-star ratings</span>
                        <span className="font-medium">
                          {item.count} ({pageFeedbackCount > 0 ? Math.round((item.count / pageFeedbackCount) * 100) : 0}%)
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <TeacherInsightsPanel
                totalFeedback={pageFeedbackCount}
                averageRating={averageRating}
                uniqueStudents={uniqueStudents}
                ratingDistribution={ratingDistribution}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
