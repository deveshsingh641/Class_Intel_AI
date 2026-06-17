import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getApiBaseUrl } from "@/lib/queryClient";
import {
  CheckCircle, XCircle, Users, Calendar,
  Clock, Shield, AlertTriangle, Key, UserCheck,
  BarChart3, Eye
} from "lucide-react";

const API = getApiBaseUrl();

function getHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export default function AttendancePage() {
  const { user } = useAuth();

  if (user?.role === "student") return <StudentAttendance />;
  return <TeacherAttendance />;
}

// Student View
function StudentAttendance() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [passcode, setPasscode] = useState("");
  const [sessionCodes, setSessionCodes] = useState<Record<string, string>>({});

  const { data: passcodeStatus, isLoading: passcodeLoading } = useQuery({
    queryKey: ["/api/attendance/passcode-status"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/attendance/passcode-status`, { headers: getHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to check passcode status");
      }
      return res.json();
    },
  });

  const { data: mySummary, isLoading: summaryLoading } = useQuery({
    queryKey: ["/api/attendance/my-summary"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/attendance/my-summary`, { headers: getHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to load attendance summary");
      }
      return res.json();
    },
  });

  const { data: sessionsRaw = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["/api/attendance/sessions"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/attendance/sessions`, { headers: getHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to load sessions");
      }
      return res.json();
    },
  });

  const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [];

  const registerPasscodeMutation = useMutation({
    mutationFn: async (codeValue: string) => {
      const res = await fetch(`${API}/api/attendance/register-passcode`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ passcode: codeValue }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Passcode Registered", description: "Your secondary check-in passcode has been registered." });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/passcode-status"] });
      setPasscode("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const markAttendanceMutation = useMutation({
    mutationFn: async ({ sessionId, code }: { sessionId: string; code: string }) => {
      const res = await fetch(`${API}/api/attendance/mark`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ sessionId, code }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Attendance Marked!", description: "Your attendance has been recorded." });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/my-summary"] });
      setSessionCodes({});
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleRegisterPasscode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) return;
    registerPasscodeMutation.mutate(passcode);
  };

  const handleMarkAttendance = (sessionId: string) => {
    const code = sessionCodes[sessionId] || "";
    if (!code.trim()) {
      toast({ title: "Verification Code Required", description: "Please enter the 6-digit session code.", variant: "destructive" });
      return;
    }
    markAttendanceMutation.mutate({ sessionId, code });
  };

  const activeSessions = sessions.filter((s: any) => s.status === "active");

  return (
    <div className="container mx-auto p-4 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Key className="h-8 w-8 text-primary" />
          Passcode Attendance
        </h1>
        <p className="text-muted-foreground mt-1">Verify your presence and check-in to classes using secure session codes</p>
      </div>

      {/* Attendance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4 flex items-center gap-4">
            <CheckCircle className="h-10 w-10 text-green-500" />
            <div>
              {summaryLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold">{mySummary?.attended || 0}</p>
              )}
              <p className="text-sm text-muted-foreground">Classes Attended</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4 flex items-center gap-4">
            <Calendar className="h-10 w-10 text-blue-500" />
            <div>
              {summaryLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold">{mySummary?.total || 0}</p>
              )}
              <p className="text-sm text-muted-foreground">Total Sessions</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4 flex items-center gap-4">
            <BarChart3 className="h-10 w-10 text-emerald-500" />
            <div>
              {summaryLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold">{mySummary?.percentage || 0}%</p>
              )}
              <p className="text-sm text-muted-foreground">Attendance Rate</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Passcode Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Student PIN Registration
          </CardTitle>
          <CardDescription>
            Configure your secondary verification passcode to verify classroom attendance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            {passcodeLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              <Badge variant={passcodeStatus?.registered ? "default" : "destructive"}>
                {passcodeStatus?.registered ? "PIN Configured ✓" : "PIN Missing"}
              </Badge>
            )}
          </div>

          <form onSubmit={handleRegisterPasscode} className="flex gap-2 max-w-sm">
            <Input
              type="password"
              placeholder="Enter numeric PIN"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              maxLength={8}
            />
            <Button type="submit" disabled={registerPasscodeMutation.isPending}>
              Register PIN
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Active Sessions - Mark Attendance */}
      <Card className="border-2 border-green-500/35">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-600">
            <Clock className="h-5 w-5 animate-pulse" />
            Active Sessions - Verify Check-In
          </CardTitle>
          <CardDescription>
            Enter the 6-digit verification code displayed by your teacher to mark attendance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : activeSessions.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">No active attendance sessions found.</p>
          ) : (
            <div className="space-y-4">
              {activeSessions.map((session: any) => (
                <div key={session._id || session.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg bg-green-50 dark:bg-green-500/10 border gap-4">
                  <div>
                    <p className="font-semibold text-lg">{session.subject}</p>
                    <p className="text-sm text-muted-foreground">
                      Started by {session.teacherName || "Teacher"} at {new Date(session.startTime).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="6-digit code"
                      className="w-32 text-center font-mono tracking-widest"
                      maxLength={6}
                      value={sessionCodes[session._id || session.id] || ""}
                      onChange={(e) => setSessionCodes({
                        ...sessionCodes,
                        [session._id || session.id]: e.target.value
                      })}
                    />
                    <Button
                      onClick={() => handleMarkAttendance(session._id || session.id)}
                      disabled={markAttendanceMutation.isPending}
                      className="gap-2"
                    >
                      <UserCheck className="h-4 w-4" /> Check In
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Teacher View
function TeacherAttendance() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const { data: sessionsRaw = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["/api/attendance/sessions"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/attendance/sessions`, { headers: getHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to load sessions");
      }
      return res.json();
    },
  });

  const { data: recordsRaw = [], isLoading: recordsLoading } = useQuery({
    queryKey: ["/api/attendance/records", selectedSession],
    queryFn: async () => {
      if (!selectedSession) return [];
      const res = await fetch(`${API}/api/attendance/sessions/${selectedSession}/records`, { headers: getHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to load records");
      }
      return res.json();
    },
    enabled: !!selectedSession,
  });

  const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [];
  const records = Array.isArray(recordsRaw) ? recordsRaw : [];

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/attendance/sessions`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ subject }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Session Created", description: "Attendance session is now active." });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/sessions"] });
      setSubject("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const closeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(`${API}/api/attendance/sessions/${sessionId}/close`, {
        method: "PATCH",
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Session Closed" });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/sessions"] });
    },
  });

  const activeSessions = sessions.filter((s: any) => s.status === "active");
  const closedSessions = sessions.filter((s: any) => s.status === "closed");

  return (
    <div className="container mx-auto p-4 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Users className="h-8 w-8 text-primary" />
          Attendance Management
        </h1>
        <p className="text-muted-foreground mt-1">Create sessions and track attendance using secure check-in codes</p>
      </div>

      {/* Create Session */}
      <Card>
        <CardHeader>
          <CardTitle>Create Attendance Session</CardTitle>
          <CardDescription>Generate a new session with a 6-digit code for students to enter.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="Enter subject (e.g., Data Structures)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="max-w-md"
            />
            <Button
              onClick={() => createSessionMutation.mutate()}
              disabled={!subject.trim() || createSessionMutation.isPending}
            >
              Start Session
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <Card className="border-2 border-green-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <Clock className="h-5 w-5 animate-pulse" /> Active Sessions
            </CardTitle>
            <CardDescription>Share the 6-digit check-in code with your students.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeSessions.map((session: any) => (
              <div key={session._id || session.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg bg-green-50 dark:bg-green-500/10 border gap-4">
                <div>
                  <p className="font-semibold text-lg">{session.subject}</p>
                  <p className="text-sm text-muted-foreground">
                    Started at {new Date(session.startTime).toLocaleTimeString()}
                  </p>
                  <div className="mt-2">
                    <span className="text-sm text-muted-foreground mr-2">Check-in PIN:</span>
                    <Badge variant="default" className="text-base font-mono tracking-wider px-3 py-1 bg-emerald-600">
                      {session.code}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedSession(session._id || session.id)}
                    className="gap-2"
                  >
                    <Eye className="h-4 w-4" /> View Records
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => closeSessionMutation.mutate(session._id || session.id)}
                  >
                    Close Session
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Records View */}
      {selectedSession && (
        <Card>
          <CardHeader>
            <CardTitle>Attendance Records</CardTitle>
            <CardDescription>Students currently marked present in this session.</CardDescription>
          </CardHeader>
          <CardContent>
            {recordsLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : records.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No attendance records yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b">
                      <th className="p-3">Student</th>
                      <th className="p-3">Method</th>
                      <th className="p-3">Time</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r: any) => (
                      <tr key={r._id || r.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium">{r.studentName}</td>
                        <td className="p-3">
                          <Badge variant="outline">{r.method === "passcode" ? "🔑 Passcode" : r.method}</Badge>
                        </td>
                        <td className="p-3 text-sm">{new Date(r.markedAt).toLocaleTimeString()}</td>
                        <td className="p-3">
                          {r.isProxy ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" /> Proxy
                            </Badge>
                          ) : (
                            <Badge variant="default" className="gap-1 bg-green-600">
                              <CheckCircle className="h-3 w-3" /> Verified
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Session History */}
      <Card>
        <CardHeader>
          <CardTitle>Session History</CardTitle>
          <CardDescription>Previous attendance sheets created by you.</CardDescription>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : closedSessions.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No past sessions</p>
          ) : (
            <div className="space-y-2">
              {closedSessions.slice(0, 10).map((s: any) => (
                <div
                  key={s._id || s.id}
                  className="flex items-center justify-between p-3 rounded border cursor-pointer hover:bg-muted/30"
                  onClick={() => setSelectedSession(s._id || s.id)}
                >
                  <div>
                    <p className="font-medium">{s.subject}</p>
                    <p className="text-sm text-muted-foreground">{new Date(s.date).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">{s.code}</Badge>
                    <Badge variant="secondary">Closed</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
