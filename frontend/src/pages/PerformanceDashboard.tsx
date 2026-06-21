import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp, TrendingDown, Brain, AlertTriangle,
  CheckCircle, Target, Activity, BarChart3,
  GraduationCap, BookOpen, RefreshCw, Users
} from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Cell
} from "recharts";
import { getApiBaseUrl } from "@/lib/queryClient";

const API = getApiBaseUrl();

function getHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export default function PerformanceDashboard() {
  const { user } = useAuth();
  if (user?.role === "student") return <StudentPerformance />;
  return <TeacherPerformanceView />;
}

// Student Performance View

function StudentPerformance() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: performance, isLoading: perfLoading } = useQuery({
    queryKey: ["/api/performance/my"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/performance/my`, { headers: getHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to load performance data");
      }
      return res.json();
    },
  });

  const predictMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/performance/predict`, {
        method: "POST",
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Prediction Updated!" });
      queryClient.invalidateQueries({ queryKey: ["/api/performance/my"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const radarData = performance ? [
    { metric: "Attendance", value: performance.attendance || 0 },
    { metric: "Quiz Avg", value: performance.quizAverage || 0 },
    { metric: "Engagement", value: performance.engagementScore || 0 },
    { metric: "Assignments", value: performance.assignmentsTotal > 0 ? Math.round((performance.assignmentsSubmitted / performance.assignmentsTotal) * 100) : 0 },
  ] : [];

  const gradeColor: Record<string, string> = {
    "A+": "text-green-600", "A": "text-green-500", "B+": "text-blue-500",
    "B": "text-blue-400", "C": "text-yellow-500", "D": "text-orange-500", "F": "text-red-600",
  };

  const riskColor: Record<string, string> = {
    low: "bg-green-600", medium: "bg-yellow-500", high: "bg-red-600",
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <TrendingUp className="h-8 w-8 text-primary" />
            Performance Insight Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">Grade and risk evaluation based on your academic data</p>
        </div>
        <Button onClick={() => predictMutation.mutate()} disabled={predictMutation.isPending} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${predictMutation.isPending ? "animate-spin" : ""}`} />
          {predictMutation.isPending ? "Analyzing..." : "Update Prediction"}
        </Button>
      </div>

      {!performance ? (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <Brain className="h-16 w-16 mx-auto text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold">No Evaluation Yet</h2>
            <p className="text-muted-foreground">Click "Update Prediction" to calculate your first performance analysis</p>
            <Button onClick={() => predictMutation.mutate()} disabled={predictMutation.isPending} className="gap-2">
              <TrendingUp className="h-4 w-4" /> Calculate Performance
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Evaluated Grade</p>
                    <p className={`text-4xl font-bold ${gradeColor[performance.predictedGrade] || "text-primary"}`}>
                      {performance.predictedGrade}
                    </p>
                  </div>
                  <GraduationCap className="h-10 w-10 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Fail Probability</p>
                    <p className="text-3xl font-bold">{performance.failProbability}%</p>
                  </div>
                  {performance.failProbability > 40 ? (
                    <TrendingDown className="h-10 w-10 text-red-500" />
                  ) : (
                    <TrendingUp className="h-10 w-10 text-green-500" />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Attendance</p>
                    <p className="text-3xl font-bold">{performance.attendance}%</p>
                  </div>
                  <Activity className="h-10 w-10 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-orange-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Risk Level</p>
                    <Badge className={`text-lg py-1 px-3 ${riskColor[performance?.riskLevel] || "bg-gray-500"}`}>
                      {(performance?.riskLevel || "unknown").toUpperCase()}
                    </Badge>
                  </div>
                  {performance?.riskLevel === "high" ? (
                    <AlertTriangle className="h-10 w-10 text-red-500" />
                  ) : (
                    <CheckCircle className="h-10 w-10 text-green-500" />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Engagement Score Ring */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="glass-card border border-emerald-500/20 md:col-span-1">
              <CardContent className="p-6 flex flex-col items-center text-center gap-4">
                <h3 className="font-semibold text-muted-foreground">Engagement Score</h3>
                <div className="relative w-36 h-36">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="40" fill="none"
                      stroke="url(#engGrad)" strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 40}`}
                      strokeDashoffset={`${2 * Math.PI * 40 * (1 - (performance.engagementScore || 0) / 100)}`}
                      style={{ transition: "stroke-dashoffset 1s ease" }}
                    />
                    <defs>
                      <linearGradient id="engGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#06b6d4" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                      {performance.engagementScore || 0}
                    </span>
                    <span className="text-xs text-muted-foreground">/ 100</span>
                  </div>
                </div>
                <div className="w-full space-y-2 text-sm">
                  {[
                    { label: "Attendance", weight: "30%", value: performance.attendance || 0, color: "from-emerald-500 to-green-400" },
                    { label: "Quiz Avg", weight: "30%", value: performance.quizAverage || 0, color: "from-blue-500 to-indigo-400" },
                    { label: "Feedback", weight: "20%", value: Math.min(100, (performance.feedbackSentiment || 0 + 1) * 50), color: "from-purple-500 to-violet-400" },
                    { label: "Assignments", weight: "20%", value: performance.assignmentsTotal > 0 ? Math.round((performance.assignmentsSubmitted / performance.assignmentsTotal) * 100) : 0, color: "from-amber-500 to-orange-400" },
                  ].map((m) => (
                    <div key={m.label} className="flex items-center gap-2">
                      <span className="text-muted-foreground w-20 text-left text-xs">{m.label}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full bg-gradient-to-r ${m.color}`} style={{ width: `${m.value}%` }} />
                      </div>
                      <span className="text-xs font-medium w-8 text-right">{Math.round(m.value)}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="md:col-span-2 grid grid-cols-1 gap-4">
            {/* Radar Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" /> Performance Radar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Radar
                      name="Score"
                      dataKey="value"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.3}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-yellow-500" /> Academic Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(performance.recommendations || []).length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-2" />
                    <p className="text-green-600 font-medium">You're on track! No concerns.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(performance.recommendations || []).map((rec: string, i: number) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20">
                        <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                        <p className="text-sm">{rec}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            </div>
          </div>

          {/* Detailed Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" /> Detailed Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricBar label="Attendance" value={performance.attendance} />
                <MetricBar label="Quiz Average" value={performance.quizAverage} />
                <MetricBar label="Engagement" value={performance.engagementScore} />
                <MetricBar
                  label="Assignments"
                  value={performance.assignmentsTotal > 0 ? Math.round((performance.assignmentsSubmitted / performance.assignmentsTotal) * 100) : 0}
                />
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-center">
            Last updated: {new Date(performance.predictedAt).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}

function MetricBar({ label, value }: { label: string; value: number }) {
  const color = value >= 75 ? "bg-green-500" : value >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-bold">{value}%</span>
      </div>
      <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// Teacher View: All Students Performance

function TeacherPerformanceView() {
  const { data: performancesRaw = [] } = useQuery({
    queryKey: ["/api/performance/all"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/performance/all`, { headers: getHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to load performance data");
      }
      return res.json();
    },
  });

  const performances = Array.isArray(performancesRaw) ? performancesRaw : [];

  const gradeDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    performances.forEach((p: any) => {
      dist[p.predictedGrade] = (dist[p.predictedGrade] || 0) + 1;
    });
    return Object.entries(dist).map(([grade, count]) => ({ grade, count }));
  }, [performances]);

  const GRADE_COLORS: Record<string, string> = {
    "A+": "#22c55e", "A": "#4ade80", "B+": "#3b82f6", "B": "#60a5fa",
    "C": "#eab308", "D": "#f97316", "F": "#ef4444",
  };

  const highRisk = performances.filter((p: any) => p.riskLevel === "high");

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Users className="h-8 w-8 text-primary" />
          Student Performance Analytics
        </h1>
        <p className="text-muted-foreground mt-1">Evaluated grades and risk analysis for all students</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Students Analyzed</p>
            <p className="text-3xl font-bold">{performances.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">High Risk Students</p>
            <p className="text-3xl font-bold text-red-600">{highRisk.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Average Attendance</p>
            <p className="text-3xl font-bold">
              {performances.length > 0
                ? Math.round(
                    performances.reduce((s: number, p: any) => s + (p.attendance || 0), 0) /
                      performances.length
                  )
                : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Grade Distribution Chart */}
      {gradeDistribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Evaluated Grade Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={gradeDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="grade" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Students">
                  {gradeDistribution.map((entry, i) => (
                    <Cell key={i} fill={GRADE_COLORS[entry.grade] || "#8884d8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Student Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Students</CardTitle>
        </CardHeader>
        <CardContent>
          {performances.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No performance data yet. Students need to use the system first.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b font-medium">
                    <th className="p-3">Student</th>
                    <th className="p-3">Attendance</th>
                    <th className="p-3">Quiz Avg</th>
                    <th className="p-3">Engagement</th>
                    <th className="p-3">Evaluated Grade</th>
                    <th className="p-3">Fail Prob</th>
                    <th className="p-3">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {performances.map((p: any) => (
                    <tr key={p._id || p.id} className={`border-b ${p.riskLevel === "high" ? "bg-red-50 dark:bg-red-500/10" : ""}`}>
                      <td className="p-3 font-medium">{p.studentName}</td>
                      <td className="p-3">{p.attendance}%</td>
                      <td className="p-3">{p.quizAverage}%</td>
                      <td className="p-3">{p.engagementScore}%</td>
                      <td className="p-3">
                        <span className="font-bold text-lg">{p.predictedGrade}</span>
                      </td>
                      <td className="p-3">{p.failProbability}%</td>
                      <td className="p-3">
                        <Badge
                          variant={p.riskLevel === "high" ? "destructive" : p.riskLevel === "medium" ? "secondary" : "default"}
                          className={p.riskLevel === "low" ? "bg-green-600" : ""}
                        >
                          {p.riskLevel}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
