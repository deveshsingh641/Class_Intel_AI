import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  GraduationCap, Link2, Upload, Users, BookOpen,
  CheckCircle2, XCircle, Loader2, FileSpreadsheet,
  ExternalLink, Database, RefreshCw, Shield
} from "lucide-react";
import { getApiBaseUrl } from "@/lib/queryClient";

const API = getApiBaseUrl();

const GOOGLE_REDIRECT_URI_EXAMPLE = `${(API || "http://localhost:5001").replace(/\/$/, "")}/api/lms/google/callback`;

function getHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export default function LMSIntegration() {
  return (
    <div className="container mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Link2 className="h-8 w-8 text-primary" />
          LMS Integration Hub
        </h1>
        <p className="text-muted-foreground mt-1">
          Connect your college LMS to auto-import teachers, students, courses & grades
        </p>
      </div>

      <LMSStatus />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <GoogleClassroomCard />
        <MoodleCard />
        <CSVImportCard />
      </div>

      <ImportHistory />
    </div>
  );
}

// ─── Status Banner ──────────────────────────────────────────────────

function LMSStatus() {
  const { data: status } = useQuery({
    queryKey: ["/api/lms/status"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/lms/status`, { headers: getHeaders() });
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
  });

  if (!status) return null;

  const connections = [
    { name: "Google Classroom", connected: status.google?.connected, configured: status.google?.configured, icon: "🎓" },
    { name: "Moodle", connected: false, configured: status.moodle?.configured, icon: "📚" },
    { name: "Microsoft Teams", connected: false, configured: status.microsoft?.configured, icon: "💼" },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {connections.map((c) => (
        <Badge
          key={c.name}
          variant={c.connected ? "default" : c.configured ? "secondary" : "outline"}
          className="flex items-center gap-2 px-3 py-1.5 text-sm"
        >
          <span>{c.icon}</span>
          {c.name}
          {c.connected ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          ) : c.configured ? (
            <span className="text-yellow-500 text-xs">Ready</span>
          ) : (
            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </Badge>
      ))}
    </div>
  );
}

// ─── Google Classroom ───────────────────────────────────────────────

function GoogleClassroomCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ["/api/lms/status"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/lms/status`, { headers: getHeaders() });
      return res.json();
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/lms/google/auth-url`, { headers: getHeaders() });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      return res.json();
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err: Error) => {
      toast({ title: "Setup Required", description: err.message, variant: "destructive" });
    },
  });

  const importCoursesMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/lms/google/import-courses`, {
        method: "POST",
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Courses Imported!", description: `${data.imported} new courses from ${data.total} total` });
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
    },
    onError: (err: Error) => {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    },
  });

  const importStudentsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/lms/google/import-students`, {
        method: "POST",
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Students Imported!", description: `${data.imported} new students added` });
    },
    onError: (err: Error) => {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    },
  });

  const isConnected = status?.google?.connected;
  const isConfigured = status?.google?.configured;

  return (
    <Card className={isConnected ? "border-green-500/50" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-2xl">🎓</span>
          Google Classroom
          {isConnected && <Badge className="bg-green-500 text-white ml-auto">Connected</Badge>}
        </CardTitle>
        <CardDescription>
          Import courses, teachers & students from Google Classroom using OAuth
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isConfigured ? (
          <div className="p-3 rounded bg-amber-500/10 border border-amber-500/30 text-sm space-y-2">
            <p className="font-medium text-amber-700 dark:text-amber-400">Setup Required</p>
            <p className="text-muted-foreground text-xs">
              Add these to your <code className="bg-muted px-1 rounded">.env</code> file:
            </p>
            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
{`GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=${GOOGLE_REDIRECT_URI_EXAMPLE}`}
            </pre>
            <p className="text-muted-foreground text-xs">
              Get credentials from <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-primary underline">Google Cloud Console</a>
            </p>
          </div>
        ) : !isConnected ? (
          <Button
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending}
            className="w-full gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Connect Google Classroom
          </Button>
        ) : (
          <div className="space-y-2">
            <Button
              onClick={() => importCoursesMutation.mutate()}
              disabled={importCoursesMutation.isPending}
              className="w-full gap-2"
              variant="outline"
            >
              {importCoursesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
              Import Courses & Teachers
            </Button>
            <Button
              onClick={() => importStudentsMutation.mutate()}
              disabled={importStudentsMutation.isPending}
              className="w-full gap-2"
              variant="outline"
            >
              {importStudentsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              Import Students
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Moodle ─────────────────────────────────────────────────────────

function MoodleCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [moodleUrl, setMoodleUrl] = useState("");
  const [moodleToken, setMoodleToken] = useState("");

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/lms/moodle/import`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ moodleUrl: moodleUrl || undefined, moodleToken: moodleToken || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Moodle Import Complete!",
        description: `${data.courses} courses, ${data.teachersImported} teachers, ${data.studentsImported} students`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
    },
    onError: (err: Error) => {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-2xl">📚</span>
          Moodle LMS
        </CardTitle>
        <CardDescription>
          Import courses & enrolled users via Moodle's Web Services API
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="https://moodle.yourcollege.edu"
          value={moodleUrl}
          onChange={(e) => setMoodleUrl(e.target.value)}
          className="text-sm"
        />
        <Input
          placeholder="Moodle API Token"
          type="password"
          value={moodleToken}
          onChange={(e) => setMoodleToken(e.target.value)}
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Get token from Moodle → Site Admin → Plugins → Web Services → Manage Tokens
        </p>
        <Button
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending}
          className="w-full gap-2"
        >
          {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          Import from Moodle
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── CSV Import ─────────────────────────────────────────────────────

function CSVImportCard() {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/api/lms/csv/import-students`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      toast({
        title: "CSV Import Complete!",
        description: `Imported: ${data.imported}, Skipped: ${data.skipped} (out of ${data.total})`,
      });
    } catch (err: any) {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6 text-green-600" />
          CSV Bulk Import
        </CardTitle>
        <CardDescription>
          Upload a CSV file with student/teacher data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground mb-3">
            Drop a CSV file or click to browse
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={handleUpload}
            className="hidden"
            id="csv-upload"
            disabled={uploading}
          />
          <Button asChild variant="outline" size="sm" disabled={uploading}>
            <label htmlFor="csv-upload" className="cursor-pointer gap-2">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Importing..." : "Choose CSV"}
            </label>
          </Button>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium">CSV Format:</p>
          <pre className="bg-muted p-2 rounded overflow-x-auto">
name,email,department,role
John Doe,john@college.edu,CSE,student
Jane Smith,jane@college.edu,IT,teacher
          </pre>
          <p>Default password: <code className="bg-muted px-1 rounded">changeme123</code></p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Recent Import History ──────────────────────────────────────────

function ImportHistory() {
  const { data: teachersRaw = [] } = useQuery({
    queryKey: ["/api/teachers"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/teachers`, { headers: getHeaders() });
      return res.json();
    },
  });

  const { data: usersRaw = [] } = useQuery({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      try {
        const res = await fetch(`${API}/api/admin/users`, { headers: getHeaders() });
        if (!res.ok) return [];
        return res.json();
      } catch {
        return [];
      }
    },
  });

  const teachers = Array.isArray(teachersRaw) ? teachersRaw : [];
  const users = Array.isArray(usersRaw)
    ? usersRaw
    : (usersRaw && typeof usersRaw === "object" && Array.isArray((usersRaw as any).items)
      ? (usersRaw as any).items
      : []);

  const teacherCount = (teachers as any[]).length;
  const studentCount = (users as any[]).filter((u: any) => u?.role === "student").length;
  const teacherUserCount = (users as any[]).filter((u: any) => u?.role === "teacher").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="h-5 w-5" />
          Current Data Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 rounded bg-blue-500/10">
            <p className="text-2xl font-bold text-blue-600">{teacherCount}</p>
            <p className="text-xs text-muted-foreground">Teacher Profiles</p>
          </div>
          <div className="text-center p-3 rounded bg-green-500/10">
            <p className="text-2xl font-bold text-green-600">{teacherUserCount}</p>
            <p className="text-xs text-muted-foreground">Teacher Accounts</p>
          </div>
          <div className="text-center p-3 rounded bg-emerald-500/10">
            <p className="text-2xl font-bold text-emerald-500">{studentCount}</p>
            <p className="text-xs text-muted-foreground">Student Accounts</p>
          </div>
          <div className="text-center p-3 rounded bg-orange-500/10">
            <p className="text-2xl font-bold text-orange-600">{teacherCount + studentCount + teacherUserCount}</p>
            <p className="text-xs text-muted-foreground">Total Users</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
