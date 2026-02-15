import { useState, useMemo, useEffect } from "react";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Users, MessageSquare, Star, Plus, GraduationCap, AlertTriangle, ShieldAlert, Check, X, Settings, BarChart3, FileSpreadsheet } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Teacher } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { BulkTeacherImport } from "@/components/BulkTeacherImport";
import { UserManagement } from "@/components/UserManagement";
import { EnhancedAnalytics } from "@/components/EnhancedAnalytics";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminPanel() {
  const { toast } = useToast();
  const [slaDays] = useState(5);
  const [overdueDeptFilter, setOverdueDeptFilter] = useState<string>("all");
  const [overdueTeacherFilter, setOverdueTeacherFilter] = useState<string>("all");

  const { data: teachers = [], isLoading, error } = useQuery<Teacher[]>({
    queryKey: ["/api/teachers"],
  });

  const { data: overdueDoubts = [] } = useQuery<{
    id: string;
    teacherId: string;
    studentName: string;
    question: string;
    status: string;
    createdAt: string | null;
    answeredAt: string | null;
    teacherName: string | null;
    department: string | null;
  }[]>({
    queryKey: ["/api/admin/doubts/overdue", slaDays],
  });

  type FlaggedFeedback = {
    id: string;
    feedbackId: string;
    userId: string;
    reason: string | null;
    status: string;
    createdAt: string | null;
    feedback?: {
      id: string;
      teacherId: string;
      studentId: string;
      studentName: string;
      rating: number;
      comment?: string | null;
      subject?: string | null;
      createdAt?: string | null;
    };
  };

  const { data: flaggedFeedback = [] } = useQuery<FlaggedFeedback[]>({
    queryKey: ["/api/admin/feedback/flagged"],
  });

  const overdueDepartments = useMemo(
    () =>
      Array.from(
        new Set(
          overdueDoubts
            .map((d) => d.department)
            .filter((dept): dept is string => Boolean(dept)),
        ),
      ),
    [overdueDoubts],
  );

  const overdueTeachers = useMemo(
    () =>
      Array.from(
        new Set(
          overdueDoubts
            .map((d) => d.teacherName)
            .filter((name): name is string => Boolean(name)),
        ),
      ),
    [overdueDoubts],
  );

  const filteredOverdueDoubts = useMemo(() =>
    overdueDoubts.filter((doubt) => {
      const matchesDept = overdueDeptFilter === "all" || doubt.department === overdueDeptFilter;
      const matchesTeacher = overdueTeacherFilter === "all" || doubt.teacherName === overdueTeacherFilter;
      return matchesDept && matchesTeacher;
    }),
    [overdueDoubts, overdueDeptFilter, overdueTeacherFilter]
  );

  useEffect(() => {
    if (error) {
      console.error("Failed to fetch teachers:", error);
      toast({
        title: "Failed to load teachers",
        description: error instanceof Error ? error.message : "Unable to fetch teachers. Please try again later.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const departments = useMemo(() => 
    Array.from(new Set(teachers.map((t) => t.department))),
    [teachers]
  );

  const totalFeedback = teachers.reduce((sum, t) => sum + (t.totalFeedback || 0), 0);
  const averageRating = teachers.length > 0 
    ? teachers.reduce((sum, t) => sum + (t.averageRating || 0), 0) / teachers.length 
    : 0;

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="container px-4 md:px-6 py-8">
          <div className="mb-8">
            <Skeleton className="h-9 w-48 mb-2" />
            <Skeleton className="h-5 w-64" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="container px-4 md:px-6 py-8">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-2">Failed to load teachers</h2>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error ? error.message : "Unable to fetch teachers. Please check your connection and try again."}
            </p>
            <Button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/teachers"] })}
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="container px-4 md:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-admin-title">Admin Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Manage teachers and monitor feedback
            </p>
          </div>
          <Button asChild data-testid="button-add-teacher">
            <a href="/admin/teachers">
              <Plus className="mr-2 h-4 w-4" />
              Manage Teachers
            </a>
          </Button>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Teachers"
                value={teachers.length}
                subtitle="Active in system"
                icon={GraduationCap}
              />
              <StatCard
                title="Total Feedback"
                value={totalFeedback}
                subtitle="All time"
                icon={MessageSquare}
              />
              <StatCard
                title="Avg. Rating"
                value={averageRating.toFixed(1)}
                subtitle="Across all teachers"
                icon={Star}
              />
              <StatCard
                title="Departments"
                value={departments.length}
                subtitle="Active"
                icon={Users}
              />
            </div>

            {/* Doubt SLA monitoring & moderation overview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Overdue Doubts
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Open for more than {slaDays} day{slaDays === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="text-2xl font-semibold">{overdueDoubts.length}</span>
                </CardHeader>
                <CardContent>
                  {overdueDoubts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No overdue doubts at the moment.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px]">
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Dept:</span>
                          <select
                            className="border border-border bg-background rounded px-1 py-0.5 text-[11px]"
                            value={overdueDeptFilter}
                            onChange={(e) => setOverdueDeptFilter(e.target.value)}
                          >
                            <option value="all">All</option>
                            {overdueDepartments.map((dept) => (
                              <option key={dept} value={dept}>
                                {dept}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Teacher:</span>
                          <select
                            className="border border-border bg-background rounded px-1 py-0.5 text-[11px]"
                            value={overdueTeacherFilter}
                            onChange={(e) => setOverdueTeacherFilter(e.target.value)}
                          >
                            <option value="all">All</option>
                            {overdueTeachers.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {filteredOverdueDoubts.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No overdue doubts match current filters.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {filteredOverdueDoubts.slice(0, 5).map((doubt) => (
                            <div
                              key={doubt.id}
                              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
                            >
                              <p className="font-medium text-sm">{doubt.studentName}</p>
                              <p className="text-xs text-muted-foreground">
                                {doubt.teacherName || "Unknown teacher"} · {doubt.department || "Unknown dept"}
                              </p>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                {doubt.question}
                              </p>
                            </div>
                          ))}
                          {filteredOverdueDoubts.length > 5 && (
                            <p className="text-xs text-muted-foreground text-center">
                              +{filteredOverdueDoubts.length - 5} more
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-red-500" />
                      Moderation Queue
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Flagged feedback for review
                    </p>
                  </div>
                  <span className="text-2xl font-semibold">{flaggedFeedback.length}</span>
                </CardHeader>
                <CardContent>
                  {flaggedFeedback.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No flagged feedback at the moment.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {flaggedFeedback.slice(0, 3).map((fb) => (
                        <div
                          key={fb.id}
                          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2"
                        >
                          <p className="font-medium text-sm">
                            {fb.feedback?.studentName || "Unknown student"} → {fb.feedback?.teacherId || "Unknown teacher"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {fb.feedback?.subject || "No subject"} · Rating {fb.feedback?.rating ?? "?"}/5
                          </p>
                          {fb.feedback?.comment && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {fb.feedback.comment}
                            </p>
                          )}
                          {fb.reason && (
                            <p className="text-[11px] text-destructive">
                              Report: {fb.reason}
                            </p>
                          )}
                        </div>
                      ))}
                      {flaggedFeedback.length > 3 && (
                        <p className="text-xs text-muted-foreground text-center">
                          +{flaggedFeedback.length - 3} more
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="analytics">
            <EnhancedAnalytics />
          </TabsContent>

          <TabsContent value="users">
            <UserManagement />
          </TabsContent>

          <TabsContent value="import">
            <BulkTeacherImport onImportComplete={() => queryClient.invalidateQueries({ queryKey: ["/api/teachers"] })} />
          </TabsContent>

          <TabsContent value="activity">
            <ActivityFeed limit={20} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
