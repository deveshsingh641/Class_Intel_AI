import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, getApiBaseUrl } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GraduationCap, BookOpen, Brain, ClipboardCheck,
  TrendingUp, MessageSquare, Star, Clock,
  CheckCircle2, XCircle, AlertTriangle, Send,
  BarChart3, Target, Award, Zap, FileText,
  ChevronRight, Sparkles, CalendarDays, Users,
  ThumbsUp, ThumbsDown, HelpCircle, Search,
  ArrowUpRight, Flame, Trophy, Activity, Lightbulb, Rocket,
} from "lucide-react";

const API = getApiBaseUrl();

function getHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

// ── Animated Counter ─────────────────────────────────────────
function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const duration = 800;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) { setDisplay(value); clearInterval(timer); }
      else setDisplay(Math.round(current));
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);
  return <>{display}{suffix}</>;
}

// ── Circular Progress ────────────────────────────────────────
function CircularProgress({ value, size = 80, strokeWidth = 8, color = "text-primary" }: {
  value: number; size?: number; strokeWidth?: number; color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="currentColor" strokeWidth={strokeWidth}
          className="text-muted/40" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          strokeWidth={strokeWidth} strokeLinecap="round"
          className={color} stroke="currentColor"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease-out" }} />
      </svg>
      <span className="absolute text-lg font-bold">{Math.round(value)}%</span>
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────────
function OverviewTab({ stats }: { stats: any }) {
  const { user } = useAuth();

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-green-600 to-teal-500 p-6 md:p-8 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyem0wLTI0VjhoLTEydjJoMTJ6TTI0IDI0djJoMTJ2LTJIMjR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-white/10 rounded-full blur-3xl animate-float" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/5 rounded-full blur-2xl" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <p className="text-white/70 text-sm font-medium mb-1">{getGreeting()}</p>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {user?.name || "Student"} 👋
            </h1>
            <p className="text-white/80 text-sm mt-2 max-w-md">
              {stats.attendancePercent >= 75
                ? "🎯 You're on track! Keep up the great work."
                : stats.attendancePercent > 0
                  ? "⚠️ Your attendance needs attention. Aim for 75%+."
                  : "Welcome to your academic dashboard. Let's get started!"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 text-center">
              <p className="text-2xl font-bold"><AnimatedNumber value={stats.attendancePercent} suffix="%" /></p>
              <p className="text-[11px] text-white/70 uppercase tracking-wider">Attendance</p>
            </div>
            <div className="hidden sm:block bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 text-center">
              <p className="text-2xl font-bold"><AnimatedNumber value={stats.quizzesTaken} /></p>
              <p className="text-[11px] text-white/70 uppercase tracking-wider">Quizzes</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-stagger">
        {[
          { label: "Attendance", value: `${stats.attendancePercent}%`, icon: ClipboardCheck, color: "from-emerald-500 to-green-400", bg: "bg-emerald-500/10", text: "text-emerald-500" },
          { label: "Quizzes Taken", value: stats.quizzesTaken, icon: FileText, color: "from-green-500 to-teal-400", bg: "bg-green-500/10", text: "text-green-500" },
          { label: "Feedback Given", value: stats.feedbackGiven, icon: MessageSquare, color: "from-teal-500 to-cyan-400", bg: "bg-teal-500/10", text: "text-teal-500" },
          { label: "Doubts Asked", value: stats.doubtsAsked, icon: HelpCircle, color: "from-cyan-500 to-emerald-400", bg: "bg-cyan-500/10", text: "text-cyan-500" },
        ].map((s, i) => (
          <Card key={i} className="glass-card hover-lift group cursor-default overflow-hidden relative">
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${s.color}`} />
            <CardContent className="p-4 flex flex-col items-center text-center gap-2">
              <div className={`h-11 w-11 rounded-xl ${s.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                <s.icon className={`h-5 w-5 ${s.text}`} />
              </div>
              <p className="text-2xl font-bold tracking-tight">{s.value}</p>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card className="glass-card overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
              <Rocket className="h-3.5 w-3.5 text-white" />
            </div>
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { href: "/attendance", icon: ClipboardCheck, label: "Mark Attendance", color: "hover:border-emerald-500/50 hover:bg-emerald-500/5", iconColor: "text-emerald-500" },
              { href: "/quizzes", icon: FileText, label: "Take Quiz", color: "hover:border-green-500/50 hover:bg-green-500/5", iconColor: "text-green-500" },
              { href: "/study-assistant", icon: Brain, label: "Study AI", color: "hover:border-teal-500/50 hover:bg-teal-500/5", iconColor: "text-teal-500" },
              { href: "/lectures", icon: BookOpen, label: "Lectures", color: "hover:border-cyan-500/50 hover:bg-cyan-500/5", iconColor: "text-cyan-500" },
            ].map((action) => (
              <Link key={action.href} href={action.href}>
                <Button variant="outline" className={`w-full h-auto py-5 flex flex-col items-center gap-2.5 transition-all duration-200 ${action.color} group`}>
                  <div className="relative">
                    <action.icon className={`h-6 w-6 ${action.iconColor} group-hover:scale-110 transition-transform`} />
                    <ArrowUpRight className="h-3 w-3 absolute -top-1 -right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                  </div>
                  <span className="text-xs font-medium">{action.label}</span>
                </Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Two-column: Recent Activity + Performance */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Recent Doubts */}
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                  <MessageSquare className="h-3.5 w-3.5 text-white" />
                </div>
                Recent Doubts
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">{stats.recentDoubts.length} total</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.recentDoubts.length === 0 ? (
              <div className="text-center py-6">
                <HelpCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">No doubts asked yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Ask your first doubt in the Doubts tab</p>
              </div>
            ) : (
              stats.recentDoubts.slice(0, 4).map((d: any, i: number) => (
                <div key={d._id || d.id || i}
                  className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors border border-transparent hover:border-border/50"
                >
                  <div className={`h-2.5 w-2.5 mt-1.5 rounded-full shrink-0 ${d.status === "answered" ? "bg-green-500 shadow-sm shadow-green-500/50" : "bg-amber-500 animate-pulse shadow-sm shadow-amber-500/50"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.question}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {d.status === "answered" ? "✅ Answered" : "⏳ Awaiting reply"}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* AI Performance Prediction */}
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <Brain className="h-3.5 w-3.5 text-white" />
              </div>
              AI Performance Insight
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.performance ? (
              <div className="space-y-4">
                <div className="flex items-center gap-6">
                  <CircularProgress
                    value={stats.performance.score || stats.attendancePercent || 0}
                    color={stats.performance.riskLevel === "low" ? "text-green-500" : stats.performance.riskLevel === "medium" ? "text-amber-500" : "text-red-500"}
                  />
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Predicted Grade</span>
                      <Badge className="bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0 text-base px-3 py-0.5">
                        {stats.performance.predictedGrade || "B+"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Risk Level</span>
                      <Badge variant={stats.performance.riskLevel === "low" ? "secondary" : "destructive"} className="gap-1">
                        {stats.performance.riskLevel === "low" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                        {stats.performance.riskLevel || "Unknown"}
                      </Badge>
                    </div>
                  </div>
                </div>
                {stats.performance.recommendations && (
                  <div className="p-3 bg-gradient-to-r from-emerald-500/5 to-green-500/5 rounded-xl border border-emerald-500/10">
                    <div className="flex items-start gap-2">
                      <Lightbulb className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
                        {typeof stats.performance.recommendations === "string"
                          ? stats.performance.recommendations
                          : stats.performance.recommendations[0] || "Keep up the good work!"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 flex items-center justify-center mb-3">
                  <BarChart3 className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <p className="text-sm text-muted-foreground">Take quizzes & attend classes to unlock AI predictions</p>
                <Link href="/performance">
                  <Button variant="ghost" size="sm" className="mt-3 text-primary gap-1">
                    View Performance <ChevronRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Motivational streak bar */}
      <Card className="glass-card bg-gradient-to-r from-emerald-500/5 via-green-500/5 to-teal-500/5 border-emerald-500/20 neon-border">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center shrink-0">
            <Flame className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Stay Consistent!</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.attendancePercent >= 75
                ? `Great job! You're maintaining ${stats.attendancePercent}% attendance. Keep the streak going!`
                : stats.attendancePercent > 0
                  ? `You need ${75 - stats.attendancePercent}% more attendance to stay on track. Don't miss classes!`
                  : "Start attending classes to build your attendance streak!"}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-1">
            {[1,2,3,4,5].map(i => (
              <div key={i} className={`h-8 w-2 rounded-full transition-all ${i * 20 <= stats.attendancePercent ? "bg-gradient-to-t from-emerald-500 to-green-400" : "bg-muted/40"}`} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Attendance Tab ───────────────────────────────────────────
function AttendanceTab() {
  const { data: summaryData, isLoading } = useQuery<any>({
    queryKey: ["/api/attendance/my-summary"],
  });
  const summary: any[] = summaryData?.subjects || [];

  const { data: simplifiiData } = useQuery<any>({
    queryKey: [`${API}/api/simplifii/my-data`],
    queryFn: async () => {
      const res = await fetch(`${API}/api/simplifii/my-data`, { headers: getHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });

  const attendanceData = simplifiiData?.attendanceSummary?.length
    ? simplifiiData.attendanceSummary
    : summary;

  if (isLoading) return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>;

  const overallPercent = attendanceData.length > 0
    ? Math.round(attendanceData.reduce((s: number, a: any) => s + (a.percentage || a.attendancePercent || 0), 0) / attendanceData.length)
    : 0;

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Overall Attendance Hero */}
      <div className={`relative overflow-hidden rounded-2xl p-6 ${overallPercent >= 75
        ? "bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-teal-500/10 border border-green-500/20"
        : "bg-gradient-to-br from-red-500/10 via-orange-500/5 to-amber-500/10 border border-red-500/20"
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">Overall Attendance</p>
            <p className="text-4xl font-bold mt-1"><AnimatedNumber value={overallPercent} suffix="%" /></p>
            <p className="text-xs text-muted-foreground mt-2">
              {overallPercent >= 75 ? "✅ Above required threshold" : "⚠️ Below 75% minimum"}
            </p>
          </div>
          <CircularProgress value={overallPercent} size={90} strokeWidth={10}
            color={overallPercent >= 75 ? "text-green-500" : "text-red-500"} />
        </div>
      </div>

      {attendanceData.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-10 text-center">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
              <ClipboardCheck className="h-10 w-10 text-muted-foreground/25" />
            </div>
            <p className="font-medium text-muted-foreground">No attendance records yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Mark attendance or import from your college portal</p>
            <div className="flex gap-3 justify-center mt-5">
              <Link href="/attendance">
                <Button size="sm" className="bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0">
                  <ClipboardCheck className="h-4 w-4 mr-1.5" /> Mark Attendance
                </Button>
              </Link>
              <Link href="/college-sync">
                <Button size="sm" variant="outline">Import from College</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-stagger">
          {attendanceData.map((subj: any, i: number) => {
            const pct = subj.percentage || subj.attendancePercent || 0;
            const total = subj.totalClasses || subj.totalSessions || 0;
            const attended = subj.attended || subj.present || 0;
            return (
              <Card key={i} className="glass-card hover-lift overflow-hidden">
                <div className={`h-1 bg-gradient-to-r ${pct >= 75 ? "from-green-500 to-emerald-400" : pct >= 50 ? "from-amber-500 to-orange-400" : "from-red-500 to-rose-400"}`} />
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{subj.subject || subj.sessionName || "Unknown"}</p>
                      {subj.teacherName && <p className="text-xs text-muted-foreground mt-0.5">{subj.teacherName}</p>}
                    </div>
                    <Badge variant={pct >= 75 ? "secondary" : "destructive"} className="ml-2 shrink-0 font-bold">
                      {Math.round(pct)}%
                    </Badge>
                  </div>
                  <div className="w-full bg-muted/50 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-1000 ${pct >= 75 ? "bg-gradient-to-r from-green-500 to-emerald-400" : pct >= 50 ? "bg-gradient-to-r from-amber-500 to-orange-400" : "bg-gradient-to-r from-red-500 to-rose-400"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-muted-foreground">{attended}/{total} classes</p>
                    {pct < 75 && total > 0 && (
                      <p className="text-[10px] text-red-500 font-medium">
                        Need {Math.max(0, Math.ceil((0.75 * total - attended) / 0.25))} more
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Doubts Tab ────────────────────────────────────────────────
function DoubtsTab() {
  const { toast } = useToast();
  const [question, setQuestion] = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState("");

  const { data: myDoubts = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/doubts/my"],
  });

  const { data: teachers = [] } = useQuery<any[]>({
    queryKey: ["/api/teachers"],
  });

  const askDoubt = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/doubts`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ teacherId: selectedTeacher, question }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Doubt submitted!", description: "Your teacher will answer soon." });
      setQuestion("");
      queryClient.invalidateQueries({ queryKey: ["/api/doubts/my"] });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const pending = myDoubts.filter((d: any) => d.status !== "answered");
  const answered = myDoubts.filter((d: any) => d.status === "answered");

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Ask a Doubt */}
      <Card className="glass-card overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500" />
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center">
              <HelpCircle className="h-3.5 w-3.5 text-white" />
            </div>
            Ask a Doubt
          </CardTitle>
          <CardDescription>Select a teacher and type your question</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <select
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-colors"
            value={selectedTeacher}
            onChange={(e) => setSelectedTeacher(e.target.value)}
          >
            <option value="">Select a teacher...</option>
            {teachers.map((t: any) => (
              <option key={t._id} value={t._id}>{t.name} — {t.subject || t.department}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <Input
              placeholder="Type your doubt or question..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="rounded-xl"
              onKeyDown={(e) => {
                if (e.key === "Enter" && question.trim() && selectedTeacher) {
                  askDoubt.mutate();
                }
              }}
            />
            <Button
              onClick={() => askDoubt.mutate()}
              disabled={!question.trim() || !selectedTeacher || askDoubt.isPending}
              className="bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0 rounded-xl px-5"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-muted/30 p-3 text-center">
          <p className="text-xl font-bold">{myDoubts.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
        </div>
        <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 p-3 text-center">
          <p className="text-xl font-bold text-amber-600">{pending.length}</p>
          <p className="text-[10px] text-amber-600/70 uppercase tracking-wider">Pending</p>
        </div>
        <div className="rounded-xl bg-green-500/5 border border-green-500/10 p-3 text-center">
          <p className="text-xl font-bold text-green-600">{answered.length}</p>
          <p className="text-[10px] text-green-600/70 uppercase tracking-wider">Answered</p>
        </div>
      </div>

      {/* Pending Doubts */}
      {pending.length > 0 && (
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              Pending <Badge variant="outline" className="ml-auto text-[10px]">{pending.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map((d: any) => (
              <div key={d._id || d.id} className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 hover:border-amber-500/30 transition-colors">
                <p className="text-sm font-medium">{d.question}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Users className="h-2.5 w-2.5" />
                    {teachers.find((t: any) => t._id === d.teacherId)?.name || "Unknown"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : ""}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Answered Doubts */}
      {answered.length > 0 && (
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Answered <Badge variant="outline" className="ml-auto text-[10px]">{answered.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {answered.map((d: any) => (
              <div key={d._id || d.id} className="p-4 rounded-xl bg-green-500/5 border border-green-500/10">
                <p className="text-sm font-semibold">{d.question}</p>
                {d.answer && (
                  <div className="mt-2 pl-3 border-l-2 border-green-500/40 ml-1">
                    <p className="text-sm text-green-700 dark:text-green-300 leading-relaxed">{d.answer}</p>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-2">
                  By: {teachers.find((t: any) => t._id === d.teacherId)?.name || "Unknown"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {myDoubts.length === 0 && !isLoading && (
        <Card className="glass-card">
          <CardContent className="p-10 text-center">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-emerald-500/5 flex items-center justify-center mb-4">
              <HelpCircle className="h-10 w-10 text-muted-foreground/25" />
            </div>
            <p className="font-medium text-muted-foreground">No doubts yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Ask your teachers anything — they're here to help!</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── My Feedback Tab ──────────────────────────────────────────
function FeedbackTab() {
  const { data: submissions = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/feedback/my"],
  });

  const { data: teachers = [] } = useQuery<any[]>({
    queryKey: ["/api/teachers"],
  });

  if (isLoading) return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>;

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-sm">{submissions.length} Feedback Submitted</p>
            <p className="text-xs text-muted-foreground">Your reviews help teachers improve</p>
          </div>
        </div>
        <Link href="/student/teachers">
          <Button size="sm" className="bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0 gap-1.5">
            <Star className="h-3.5 w-3.5" /> Give Feedback
          </Button>
        </Link>
      </div>

      {submissions.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-10 text-center">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-emerald-500/5 flex items-center justify-center mb-4">
              <MessageSquare className="h-10 w-10 text-muted-foreground/25" />
            </div>
            <p className="font-medium text-muted-foreground">No feedback given yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Share constructive feedback to help your teachers</p>
            <Link href="/student/teachers">
              <Button className="mt-5 bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0" size="sm">
                Browse Teachers
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3 animate-stagger">
          {submissions.map((fb: any) => {
            const teacher = teachers.find((t: any) => t._id === fb.teacherId);
            return (
              <Card key={fb._id} className="glass-card hover-lift overflow-hidden group">
                <div className="h-0.5 bg-gradient-to-r from-emerald-500/50 to-green-500/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                        {teacher?.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "??"}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm">{teacher?.name || "Unknown Teacher"}</p>
                        <p className="text-xs text-muted-foreground">{teacher?.subject || teacher?.department || ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`h-3.5 w-3.5 ${i < fb.rating ? "fill-amber-500 text-amber-500" : "text-muted-foreground/20"}`} />
                      ))}
                    </div>
                  </div>
                  {fb.comment && <p className="text-sm mt-3 text-muted-foreground leading-relaxed">{fb.comment}</p>}
                  <div className="flex items-center gap-2 mt-3">
                    <Badge variant="outline" className="text-[10px]">
                      <CalendarDays className="h-2.5 w-2.5 mr-1" />
                      {fb.createdAt ? new Date(fb.createdAt).toLocaleDateString() : ""}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Teachers Tab ─────────────────────────────────────────────
function TeachersTab() {
  const [search, setSearch] = useState("");

  const { data: teachers = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/teachers"],
  });

  const { data: favoriteIds = [] } = useQuery<string[]>({
    queryKey: ["/api/favorites/my"],
    staleTime: 0,  // always refetch from DB — prevents UI showing stale favourites
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return teachers;
    const q = search.toLowerCase();
    return teachers.filter((t: any) =>
      t.name?.toLowerCase().includes(q) || t.department?.toLowerCase().includes(q) || t.subject?.toLowerCase().includes(q)
    );
  }, [teachers, search]);

  const toggleFav = useMutation({
    mutationFn: async (teacherId: string) => {
      const isFav = favoriteIds.includes(teacherId);
      const res = await fetch(`${API}/api/favorites/${teacherId}`, {
        method: isFav ? "DELETE" : "POST",
        headers: getHeaders(),
      });
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          const data = await res.json();
          msg = data.error || data.message || msg;
        } catch {}
        throw new Error(msg);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/favorites/my"] }),
    onError: () => queryClient.invalidateQueries({ queryKey: ["/api/favorites/my"] }),
  });

  if (isLoading) return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>;

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, subject, or department..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 rounded-xl"
        />
      </div>

      {/* Favorite Teachers */}
      {favoriteIds.length > 0 && !search && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Favorites</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {teachers.filter((t: any) => favoriteIds.includes(t._id)).map((t: any) => (
              <TeacherMiniCard key={t._id} teacher={t} isFav onToggleFav={() => toggleFav.mutate(t._id)} />
            ))}
          </div>
        </div>
      )}

      {/* All Teachers */}
      <div>
        {favoriteIds.length > 0 && !search && (
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">All Teachers</p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-stagger">
          {filtered.map((t: any) => (
            <TeacherMiniCard
              key={t._id}
              teacher={t}
              isFav={favoriteIds.includes(t._id)}
              onToggleFav={() => toggleFav.mutate(t._id)}
            />
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-10">
          <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/20" />
          <p className="font-medium text-muted-foreground">No teachers found</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Try a different search term</p>
        </div>
      )}
    </div>
  );
}

function TeacherMiniCard({ teacher, isFav, onToggleFav }: { teacher: any; isFav: boolean; onToggleFav: () => void }) {
  const colors = ["from-emerald-500 to-green-500", "from-green-500 to-teal-500", "from-teal-500 to-cyan-500", "from-cyan-500 to-emerald-500", "from-emerald-600 to-teal-400", "from-green-600 to-emerald-400"];
  const colorIdx = (teacher.name?.charCodeAt(0) || 0) % colors.length;

  return (
    <Card className="glass-card hover-lift group overflow-hidden transition-all">
      <CardContent className="p-4 flex items-center gap-3.5">
        <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${colors[colorIdx]} flex items-center justify-center text-white font-bold text-sm shrink-0 group-hover:scale-105 transition-transform`}>
          {teacher.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <Link href={`/teacher/${teacher._id}`}>
            <p className="font-semibold text-sm hover:text-primary transition-colors cursor-pointer truncate">{teacher.name}</p>
          </Link>
          <p className="text-xs text-muted-foreground">{teacher.subject || teacher.department}</p>
          {teacher.averageRating > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
              <span className="text-xs font-medium">{teacher.averageRating?.toFixed(1)}</span>
              <span className="text-[10px] text-muted-foreground">({teacher.totalFeedback || 0})</span>
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onToggleFav} className="shrink-0 h-9 w-9 rounded-xl hover:bg-amber-500/10">
          <Star className={`h-4 w-4 transition-colors ${isFav ? "fill-amber-500 text-amber-500" : "text-muted-foreground"}`} />
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Main StudentHub Component ────────────────────────────────
export default function StudentHub() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch all data needed
  const { data: teachers = [] } = useQuery<any[]>({ queryKey: ["/api/teachers"] });
  const { data: submittedIds = [] } = useQuery<string[]>({ queryKey: ["/api/feedback/my-submissions"] });
  const { data: myDoubts = [] } = useQuery<any[]>({ queryKey: ["/api/doubts/my"] });
  const { data: myFeedback = [] } = useQuery<any[]>({ queryKey: ["/api/feedback/my"] });
  const { data: attendanceSummary } = useQuery<any>({ queryKey: ["/api/attendance/my-summary"] });
  const { data: quizAttempts = [] } = useQuery<any[]>({ queryKey: ["/api/quizzes"] });
  const { data: performanceData } = useQuery<any>({
    queryKey: ["/api/performance/my"],
    retry: false,
  });

  const stats = useMemo(() => {
    const attPct = attendanceSummary?.percentage ?? 0;

    return {
      attendancePercent: attPct,
      quizzesTaken: Array.isArray(quizAttempts) ? quizAttempts.length : 0,
      feedbackGiven: submittedIds.length,
      doubtsAsked: myDoubts.length,
      recentDoubts: myDoubts.slice(0, 5),
      performance: performanceData || null,
    };
  }, [attendanceSummary, quizAttempts, submittedIds, myDoubts, performanceData]);

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-5xl">
      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-auto rounded-2xl bg-muted/50 p-1">
          {[
            { value: "overview", icon: BarChart3, label: "Overview" },
            { value: "attendance", icon: ClipboardCheck, label: "Attendance" },
            { value: "doubts", icon: HelpCircle, label: "Doubts" },
            { value: "feedback", icon: MessageSquare, label: "Feedback" },
            { value: "teachers", icon: Users, label: "Teachers" },
          ].map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="flex flex-col items-center gap-1 py-2.5 text-xs rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all relative"
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline font-medium">{tab.label}</span>
              {tab.value === "doubts" && myDoubts.filter((d: any) => d.status !== "answered").length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-[9px] text-white flex items-center justify-center font-bold shadow-sm">
                  {myDoubts.filter((d: any) => d.status !== "answered").length}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-5">
          <OverviewTab stats={stats} />
        </TabsContent>

        <TabsContent value="attendance" className="mt-5">
          <AttendanceTab />
        </TabsContent>

        <TabsContent value="doubts" className="mt-5">
          <DoubtsTab />
        </TabsContent>

        <TabsContent value="feedback" className="mt-5">
          <FeedbackTab />
        </TabsContent>

        <TabsContent value="teachers" className="mt-5">
          <TeachersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
