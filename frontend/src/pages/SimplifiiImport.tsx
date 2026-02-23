import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  GraduationCap, Download, Users, BookOpen, CheckCircle2,
  Loader2, Shield, AlertTriangle, Clock, TrendingUp,
  BarChart3, UserCheck, RefreshCw
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

function getHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

interface AttendanceSummary {
  subject: string;
  teacherName: string;
  totalClasses: number;
  attended: number;
  percentage: number;
  status: string;
}

interface Teacher {
  name: string;
  subject: string;
  department: string;
}

interface ScrapeResult {
  success: boolean;
  student: { name: string; enrollmentNo: string; branch: string; semester: string };
  scraped: { attendance: number; lectures: number; teachers: number };
  imported: { teachers: number; attendanceRecords: number; lectures: number };
  rawData: { attendance: AttendanceSummary[]; teachers: Teacher[]; lecturesSample: any[] };
}

interface MyData {
  attendanceSummary: AttendanceSummary[];
  recentLectures: any[];
  teachers: Teacher[];
  linked: boolean;
}

export default function SimplifiiImport() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [scraping, setScraping] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [myData, setMyData] = useState<MyData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const { toast } = useToast();
  const progressRef = useRef<HTMLDivElement>(null);

  // Fetch existing imported data on mount
  useEffect(() => {
    fetchMyData();
  }, []);

  // Auto-scroll progress log
  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.scrollTop = progressRef.current.scrollHeight;
    }
  }, [progress]);

  const fetchMyData = async () => {
    setLoadingData(true);
    try {
      const res = await fetch(`${API}/api/simplifii/my-data`, { headers: getHeaders() });
      if (res.ok) setMyData(await res.json());
    } catch { /* ignore */ }
    setLoadingData(false);
  };

  // Poll progress during scraping
  useEffect(() => {
    if (!scraping) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/simplifii/progress`, { headers: getHeaders() });
        if (res.ok) {
          const data = await res.json();
          setProgress(data.progress);
        }
      } catch { /* ignore */ }
    }, 1000);
    return () => clearInterval(interval);
  }, [scraping]);

  const handleScrape = async () => {
    if (!username || !password) {
      toast({ title: "Enter your Simplifii credentials", variant: "destructive" });
      return;
    }

    setScraping(true);
    setProgress(["🚀 Connecting to ABES Simplifii portal..."]);
    setResult(null);

    try {
      const res = await fetch(`${API}/api/simplifii/scrape`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({
          title: "Scraping Failed",
          description: data.error || "Unknown error",
          variant: "destructive",
        });
        setProgress((p) => [...p, `❌ Error: ${data.error}`]);
      } else {
        setResult(data);
        setProgress((p) => [...p, "✅ Data imported successfully!"]);
        toast({
          title: "Import Complete!",
          description: `${data.scraped.attendance} subjects, ${data.scraped.lectures} lectures, ${data.scraped.teachers} teachers imported`,
        });
        fetchMyData();
      }
    } catch (err: any) {
      toast({ title: "Network Error", description: err.message, variant: "destructive" });
      setProgress((p) => [...p, `❌ Network error: ${err.message}`]);
    }

    setScraping(false);
  };

  const getAttendanceColor = (pct: number) => {
    if (pct >= 75) return "text-green-600 bg-green-50 border-green-200";
    if (pct >= 60) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  const getAttendanceBadge = (pct: number) => {
    if (pct >= 85) return { label: "Excellent", variant: "default" as const };
    if (pct >= 75) return { label: "Safe", variant: "secondary" as const };
    if (pct >= 65) return { label: "At Risk", variant: "outline" as const };
    return { label: "Critical", variant: "destructive" as const };
  };

  // ── Already has imported data ─────────────────────────────
  const hasData = myData?.linked && (myData.attendanceSummary.length > 0);

  return (
    <div className="container mx-auto p-4 space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <GraduationCap className="h-8 w-8 text-blue-600" />
          ABES College Portal Sync
        </h1>
        <p className="text-muted-foreground mt-1">
          Auto-fetch your real attendance, lectures & teacher data from Simplifii ERP
        </p>
      </div>

      {/* Connection Card */}
      <Card className={hasData ? "border-green-500/50" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Connect to Simplifii Portal
            {hasData && <Badge className="bg-green-500 text-white ml-auto">Synced</Badge>}
          </CardTitle>
          <CardDescription>
            Enter your ABES Simplifii login credentials. Your password is only used once to fetch data — it is NOT stored.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">
                Enrollment Number / Email
              </label>
              <Input
                placeholder="e.g., 0620213103"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={scraping}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">
                Simplifii Password
              </label>
              <Input
                type="password"
                placeholder="Your portal password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={scraping}
                onKeyDown={(e) => e.key === "Enter" && handleScrape()}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleScrape}
              disabled={scraping}
              className="gap-2"
              size="lg"
            >
              {scraping ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Fetching from ABES Portal...
                </>
              ) : hasData ? (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Re-sync Data
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Fetch My College Data
                </>
              )}
            </Button>

            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Shield className="h-3 w-3" />
              Credentials are not saved
            </div>
          </div>

          {/* Warning */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Note:</strong> This uses browser automation to fetch your data from{" "}
              <a href="https://abes.web.simplifii.com" target="_blank" rel="noreferrer" className="underline">
                abes.web.simplifii.com
              </a>.
              First-time fetch may take 30-60 seconds. Make sure you have the correct login credentials.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress Log */}
      {progress.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Sync Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={progressRef}
              className="bg-slate-950 text-green-400 rounded-lg p-4 font-mono text-sm max-h-48 overflow-y-auto space-y-1"
            >
              {progress.map((msg, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-slate-500 select-none">{String(i + 1).padStart(2, "0")}</span>
                  <span>{msg}</span>
                </div>
              ))}
              {scraping && (
                <div className="flex items-center gap-2 text-yellow-400">
                  <span className="animate-pulse">●</span> Working...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scrape Results */}
      {result && (
        <Card className="border-green-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              Import Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                <p className="text-2xl font-bold text-blue-600">{result.student.name || "—"}</p>
                <p className="text-xs text-muted-foreground">Student Name</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                <p className="text-2xl font-bold text-emerald-500">{result.student.enrollmentNo || "—"}</p>
                <p className="text-xs text-muted-foreground">Enrollment No</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
                <p className="text-2xl font-bold text-green-600">{result.student.branch || "—"}</p>
                <p className="text-xs text-muted-foreground">Branch</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30">
                <p className="text-2xl font-bold text-orange-600">{result.student.semester || "—"}</p>
                <p className="text-xs text-muted-foreground">Semester</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4 text-center">
                <BarChart3 className="h-8 w-8 mx-auto text-green-500 mb-2" />
                <p className="text-3xl font-bold text-green-600">{result.scraped.attendance}</p>
                <p className="text-sm text-muted-foreground">Subjects Fetched</p>
                <p className="text-xs text-green-600">+{result.imported.attendanceRecords} imported</p>
              </div>
              <div className="bg-pink-50 dark:bg-pink-950/30 rounded-lg p-4 text-center">
                <BookOpen className="h-8 w-8 mx-auto text-pink-500 mb-2" />
                <p className="text-3xl font-bold text-pink-600">{result.scraped.lectures}</p>
                <p className="text-sm text-muted-foreground">Lecture Records</p>
                <p className="text-xs text-green-600">+{result.imported.lectures} imported</p>
              </div>
              <div className="bg-teal-50 dark:bg-teal-950/30 rounded-lg p-4 text-center">
                <Users className="h-8 w-8 mx-auto text-teal-500 mb-2" />
                <p className="text-3xl font-bold text-teal-600">{result.scraped.teachers}</p>
                <p className="text-sm text-muted-foreground">Teachers Found</p>
                <p className="text-xs text-green-600">+{result.imported.teachers} new</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attendance Data (from imported or just-scraped data) */}
      {(() => {
        const attendanceData = result?.rawData?.attendance || myData?.attendanceSummary || [];
        if (attendanceData.length === 0) return null;

        const totalClasses = attendanceData.reduce((a, b) => a + (b.totalClasses || 0), 0);
        const totalAttended = attendanceData.reduce((a, b) => a + (b.attended || 0), 0);
        const overallPct = totalClasses > 0 ? Math.round((totalAttended / totalClasses) * 100 * 10) / 10 : 0;

        return (
          <>
            {/* Overall Attendance Banner */}
            <Card className={overallPct >= 75 ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white" : "bg-gradient-to-r from-red-500 to-orange-600 text-white"}>
              <CardContent className="py-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-80">Overall Attendance</p>
                    <p className="text-5xl font-bold mt-1">{overallPct}%</p>
                    <p className="text-sm opacity-80 mt-1">{totalAttended} / {totalClasses} classes attended</p>
                  </div>
                  <div className="text-right">
                    <TrendingUp className="h-12 w-12 opacity-50" />
                    <p className="text-sm opacity-80 mt-2">{attendanceData.length} subjects</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Subject-wise Attendance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Subject-wise Attendance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {attendanceData.map((att, i) => {
                    const pct = att.percentage || (att.totalClasses > 0 ? Math.round((att.attended / att.totalClasses) * 100) : 0);
                    const badge = getAttendanceBadge(pct);

                    return (
                      <div
                        key={i}
                        className={`rounded-lg border p-4 ${getAttendanceColor(pct)}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h3 className="font-semibold">{att.subject}</h3>
                            <p className="text-xs opacity-70">{att.teacherName || "—"}</p>
                          </div>
                          <div className="text-right flex items-center gap-2">
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                            <span className="text-2xl font-bold">{pct}%</span>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-white/50 dark:bg-white/10 rounded-full h-2.5 mt-2">
                          <div
                            className={`h-2.5 rounded-full transition-all duration-500 ${pct >= 75 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>

                        <div className="flex justify-between text-xs mt-1 opacity-60">
                          <span>Attended: {att.attended} / {att.totalClasses}</span>
                          <span>{att.status || ""}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        );
      })()}

      {/* Teachers List */}
      {(() => {
        const teacherData = result?.rawData?.teachers || myData?.teachers || [];
        if (teacherData.length === 0) return null;

        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Teachers ({teacherData.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {teacherData.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {t.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.subject || t.department || "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Recent Lectures */}
      {(() => {
        const lectureData = result?.rawData?.lecturesSample || myData?.recentLectures || [];
        if (lectureData.length === 0) return null;

        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Recent Lectures ({lectureData.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium">Date</th>
                      <th className="text-left py-2 px-3 font-medium">Subject</th>
                      <th className="text-left py-2 px-3 font-medium">Teacher</th>
                      <th className="text-left py-2 px-3 font-medium">Time</th>
                      <th className="text-center py-2 px-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lectureData.map((l: any, i: number) => (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        <td className="py-2 px-3">
                          {l.date ? new Date(l.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                        </td>
                        <td className="py-2 px-3 font-medium">{l.subject || "—"}</td>
                        <td className="py-2 px-3 text-muted-foreground">{l.teacherName || "—"}</td>
                        <td className="py-2 px-3 text-muted-foreground">{l.time || "—"}</td>
                        <td className="py-2 px-3 text-center">
                          <Badge
                            variant={l.status === "present" || l.status === "P" ? "default" : "destructive"}
                            className="text-xs"
                          >
                            {l.status === "present" || l.status === "P" ? "Present" : "Absent"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Empty State */}
      {!hasData && !result && !loadingData && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <GraduationCap className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground mb-2">
              No College Data Synced Yet
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Enter your ABES Simplifii portal credentials above and click
              "Fetch My College Data" to automatically import your attendance,
              lectures, and teacher information.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loadingData && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
