import { useState, useMemo, useEffect } from "react";
import { TeacherCard } from "@/components/TeacherCard";
import { FeedbackForm } from "@/components/FeedbackForm";
import { Confetti } from "@/components/Confetti";
import { ExportButton } from "@/components/ExportButton";
import { AdvancedSearch, type SearchFilters } from "@/components/AdvancedSearch";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Teacher } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

type TeacherWithId = Teacher & { id: string };

export default function StudentTeachers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherWithId | null>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [searchFilters, setSearchFilters] = useState<SearchFilters | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const [page, setPage] = useState(1);
  const pageSize = 18;
  const [loadedTeachers, setLoadedTeachers] = useState<TeacherWithId[]>([]);
  const [totalTeachers, setTotalTeachers] = useState(0);

  const { data: departments = [] } = useQuery<string[]>({
    queryKey: ["/api/teachers/departments"],
  });

  const teachersUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(pageSize));

    const q = searchFilters?.query?.trim();
    if (q) params.set("q", q);

    if (searchFilters?.department && searchFilters.department !== "all") {
      params.set("department", searchFilters.department);
    }

    if (searchFilters) {
      params.set("minRating", String(searchFilters.minRating));
      params.set("maxRating", String(searchFilters.maxRating));
      params.set("minFeedback", String(searchFilters.minFeedback));
      params.set("sortBy", searchFilters.sortBy);
    } else {
      params.set("sortBy", "name-asc");
    }

    return `/api/teachers/search?${params.toString()}`;
  }, [page, pageSize, searchFilters]);

  const {
    data: teachersResult,
    isLoading: teachersLoading,
    error: teachersError,
  } = useQuery<{
    items: TeacherWithId[];
    total: number;
    page: number;
    limit: number;
  }>({
    queryKey: [teachersUrl],
  });

  const { data: submittedTeacherIds = [] } = useQuery<string[]>({
    queryKey: ["/api/feedback/my-submissions"],
  });

  const { data: favoriteTeacherIds = [] } = useQuery<string[]>({
    queryKey: ["/api/favorites/my"],
    staleTime: 0,  // always refetch from DB — prevents UI showing stale favourites
  });

  const [preferences, setPreferences] = useState("");

  const recommendationsMutation = useMutation({
    mutationFn: async (prefs: string) => {
      const res = await apiRequest("POST", "/api/ai/recommend-teachers", { preferences: prefs });
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return res.json() as Promise<{ recommendations: string[] }>;
      }
      const text = await res.text();
      throw new Error(text && !text.startsWith("<") ? text : "Recommendations API did not return valid JSON");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to get recommendations",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (teachersError) {
      console.error("Failed to fetch teachers:", teachersError);
      toast({
        title: "Failed to load teachers",
        description:
          teachersError instanceof Error
            ? teachersError.message
            : "Unable to fetch teachers. Please try again later.",
        variant: "destructive",
      });
    }
  }, [teachersError, toast]);

  useEffect(() => {
    setPage(1);
  }, [searchFilters]);

  const feedbackMutation = useMutation({
    mutationFn: async (data: {
      teacherId: string;
      rating: number;
      comment: string;
      anonymous?: boolean;
      doubt?: string;
    }) => {
      const payload = {
        teacherId: data.teacherId,
        rating: data.rating,
        comment: data.comment,
        isAnonymous: !!data.anonymous,
        doubt: data.doubt,
      };
      const res = await apiRequest("POST", "/api/feedback", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feedback/my-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feedback/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/recent"] });
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
      setFeedbackDialogOpen(false);
      toast({
        title: "🎉 Feedback submitted!",
        description: "Thank you for your feedback.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit feedback",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addFavoriteMutation = useMutation({
    mutationFn: async (teacherId: string) => {
      const res = await apiRequest("POST", `/api/favorites/${teacherId}`);
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return res.json();
      }
      const text = await res.text();
      throw new Error(text && !text.startsWith("<") ? text : "Favorites API did not return valid JSON");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/favorites/my"] });
    },
  });

  const removeFavoriteMutation = useMutation({
    mutationFn: async (teacherId: string) => {
      const res = await apiRequest("DELETE", `/api/favorites/${teacherId}`);
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return res.json();
      }
      const text = await res.text();
      throw new Error(text && !text.startsWith("<") ? text : "Favorites API did not return valid JSON");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/favorites/my"] });
    },
  });

  useEffect(() => {
    if (!teachersResult) return;
    setTotalTeachers(teachersResult.total);
    const normalized = teachersResult.items.map((t: any) => ({
      ...(t as Teacher),
      id: (t as any).id ?? (t as any)._id ?? "",
    }));
    if (page === 1) {
      setLoadedTeachers(normalized);
      return;
    }
    setLoadedTeachers((prev) => {
      const existing = new Set(prev.map((t) => t.id));
      const next = normalized.filter((t) => !existing.has(t.id));
      return [...prev, ...next];
    });
  }, [page, teachersResult]);

  const hasMoreTeachers = loadedTeachers.length < totalTeachers;

  const handleGiveFeedback = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setFeedbackDialogOpen(true);
  };

  const handleSubmitFeedback = (
    teacherId: string,
    rating: number,
    comment: string,
    anonymous: boolean,
    doubt?: string
  ) => {
    feedbackMutation.mutate({ teacherId, rating, comment, anonymous, doubt });
  };

  if (teachersLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="container px-4 md:px-6 py-8">
          <div className="mb-8">
            <Skeleton className="h-9 w-64 mb-2" />
            <Skeleton className="h-5 w-48" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (teachersError) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="container px-4 md:px-6 py-8">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-2">Failed to load data</h2>
            <p className="text-muted-foreground mb-4">
              {teachersError instanceof Error
                ? teachersError.message
                : "Unable to fetch teachers. Please check your connection and try again."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <Confetti active={showConfetti} />
      <div className="container px-4 md:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" data-testid="text-welcome">
            Browse Teachers
          </h1>
          <p className="text-muted-foreground mt-1">
            Find teachers and share detailed feedback
          </p>
        </div>

        <div className="mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex-1 w-full sm:max-w-2xl">
              <AdvancedSearch
                onSearch={(filters) => setSearchFilters(filters)}
                departments={departments}
              />
            </div>
            <div className="flex-shrink-0 w-full sm:w-auto">
              <ExportButton data={loadedTeachers} type="teachers" filename="teachers-list" />
            </div>
          </div>

          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">Get AI teacher recommendations</p>
                </div>
                <Button
                  size="sm"
                  disabled={!preferences.trim() || recommendationsMutation.isPending}
                  onClick={() => {
                    if (!preferences.trim()) return;
                    recommendationsMutation.mutate(preferences.trim());
                  }}
                >
                  {recommendationsMutation.isPending ? "Thinking..." : "Ask AI"}
                </Button>
              </div>
              <Textarea
                value={preferences}
                onChange={(e) => setPreferences(e.target.value)}
                placeholder="Describe what kind of teacher you are looking for (subject, style, experience)..."
                className="min-h-[60px]"
              />
              {Array.isArray(recommendationsMutation.data?.recommendations) &&
                recommendationsMutation.data.recommendations.length > 0 && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="font-semibold text-foreground text-sm">Suggested matches</p>
                    <ul className="list-disc list-inside space-y-1">
                      {recommendationsMutation.data.recommendations.map((rec, idx) => (
                        <li key={idx}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loadedTeachers.map((teacher) => (
            <TeacherCard
              key={teacher.id}
              teacher={{
                id: teacher.id,
                name: teacher.name,
                department: teacher.department,
                subject: teacher.subject,
                averageRating: teacher.averageRating || 0,
                totalFeedback: teacher.totalFeedback || 0,
                officeHours: teacher.officeHours || "",
              }}
              onGiveFeedback={() => handleGiveFeedback(teacher)}
              hasGivenFeedback={submittedTeacherIds.includes(teacher.id)}
              isFavorite={favoriteTeacherIds.includes(teacher.id)}
              onToggleFavorite={() =>
                favoriteTeacherIds.includes(teacher.id)
                  ? removeFavoriteMutation.mutate(teacher.id)
                  : addFavoriteMutation.mutate(teacher.id)
              }
            />
          ))}
        </div>

        {loadedTeachers.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground" data-testid="text-no-teachers">
              No teachers found matching your criteria.
            </p>
          </div>
        )}

        {hasMoreTeachers && (
          <div className="flex justify-center mt-8">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setPage((p) => p + 1)}
              disabled={teachersLoading}
            >
              {teachersLoading ? "Loading..." : "Load More Teachers"}
            </Button>
          </div>
        )}

        <FeedbackForm
          teacher={
            selectedTeacher
              ? {
                  id: selectedTeacher.id,
                  name: selectedTeacher.name,
                  department: selectedTeacher.department,
                  subject: selectedTeacher.subject,
                  averageRating: selectedTeacher.averageRating || 0,
                  totalFeedback: selectedTeacher.totalFeedback || 0,
                }
              : null
          }
          open={feedbackDialogOpen}
          onOpenChange={setFeedbackDialogOpen}
          onSubmit={handleSubmitFeedback}
          isSubmitting={feedbackMutation.isPending}
        />
      </div>
    </div>
  );
}
