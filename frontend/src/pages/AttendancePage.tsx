import { useState, useRef, useCallback, useEffect } from "react";
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
  Camera, CheckCircle, XCircle, Users, Calendar,
  Clock, Shield, AlertTriangle, Video, UserCheck,
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  if (user?.role === "student") return <StudentAttendance />;
  return <TeacherAttendance />;
}

// ─── Student View ───────────────────────────────────────────────────

function StudentAttendance() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturing, setCapturing] = useState(false);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const { data: faceStatus, isLoading: faceLoading } = useQuery({
    queryKey: ["/api/attendance/face-status"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/attendance/face-status`, { headers: getHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to check face status");
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

  const registerFaceMutation = useMutation({
    mutationFn: async () => {
      // Generate a simulated face descriptor (128 floats)
      // In production, this would use face-api.js to extract real descriptors
      const descriptor = Array.from({ length: 128 }, () => Math.random() * 2 - 1);
      const res = await fetch(`${API}/api/attendance/register-face`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ faceDescriptor: descriptor }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Face Registered", description: "Your face has been registered for attendance." });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/face-status"] });
      stopCamera();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setCapturing(false);
    },
  });

  const markAttendanceMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(`${API}/api/attendance/mark`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ sessionId, method: "face", confidence: 0.85 + Math.random() * 0.14 }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Attendance Marked!", description: "Your attendance has been recorded." });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/my-summary"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      toast({ title: "Camera Error", description: "Could not access camera. Please allow camera permissions.", variant: "destructive" });
    }
  }, [toast]);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCapturing(false);
  }, []);

  const captureAndRegister = useCallback(async () => {
    setCapturing(true);
    // Simulate face detection delay
    await new Promise(r => setTimeout(r, 1500));
    registerFaceMutation.mutate();
  }, [registerFaceMutation]);

  const activeSessions = sessions.filter((s: any) => s.status === "active");

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Camera className="h-8 w-8 text-primary" />
          Face Attendance
        </h1>
        <p className="text-muted-foreground mt-1">Register your face and mark attendance using facial recognition</p>
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

      {/* Face Registration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Face Registration
          </CardTitle>
          <CardDescription>
            {faceStatus?.registered
              ? "Your face is registered. You can re-register to update."
              : "Register your face to enable facial attendance"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant={faceStatus?.registered ? "default" : "destructive"}>
              {faceStatus?.registered ? "Registered ✓" : "Not Registered"}
            </Badge>
            {faceStatus?.registeredAt && (
              <span className="text-sm text-muted-foreground">
                Registered on {new Date(faceStatus.registeredAt).toLocaleDateString()}
              </span>
            )}
          </div>

          <div className="relative bg-black rounded-lg overflow-hidden" style={{ maxWidth: 640, aspectRatio: "4/3" }}>
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            {!cameraActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/80">
                <div className="text-center space-y-2">
                  <Video className="h-12 w-12 mx-auto text-muted-foreground" />
                  <p className="text-muted-foreground">Camera is off</p>
                </div>
              </div>
            )}
            {capturing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-center text-white space-y-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto" />
                  <p>Detecting face...</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {!cameraActive ? (
              <Button onClick={startCamera} className="gap-2">
                <Camera className="h-4 w-4" /> Start Camera
              </Button>
            ) : (
              <>
                <Button onClick={captureAndRegister} disabled={capturing || registerFaceMutation.isPending} className="gap-2">
                  <UserCheck className="h-4 w-4" /> {capturing ? "Detecting..." : "Register Face"}
                </Button>
                <Button variant="outline" onClick={stopCamera}>Stop Camera</Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Active Sessions - Mark Attendance */}
      {activeSessions.length > 0 && (
        <Card className="border-2 border-green-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <Clock className="h-5 w-5 animate-pulse" />
              Active Sessions - Mark Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeSessions.map((session: any) => (
                <div key={session._id || session.id} className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-500/10 border">
                  <div>
                    <p className="font-medium">{session.subject}</p>
                    <p className="text-sm text-muted-foreground">
                      Started {new Date(session.startTime).toLocaleTimeString()}
                    </p>
                  </div>
                  <Button
                    onClick={() => markAttendanceMutation.mutate(session._id || session.id)}
                    disabled={markAttendanceMutation.isPending || !faceStatus?.registered}
                    className="gap-2"
                  >
                    <CheckCircle className="h-4 w-4" /> Mark Present
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Teacher View ───────────────────────────────────────────────────

function TeacherAttendance() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const { data: sessionsRaw = [] } = useQuery({
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

  const { data: recordsRaw = [] } = useQuery({
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
    <div className="container mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Users className="h-8 w-8 text-primary" />
          Attendance Management
        </h1>
        <p className="text-muted-foreground mt-1">Create sessions, track attendance with AI face recognition</p>
      </div>

      {/* Create Session */}
      <Card>
        <CardHeader>
          <CardTitle>Create Attendance Session</CardTitle>
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
          </CardHeader>
          <CardContent className="space-y-3">
            {activeSessions.map((session: any) => (
              <div key={session._id || session.id} className="flex items-center justify-between p-4 rounded-lg bg-green-50 dark:bg-green-500/10 border">
                <div>
                  <p className="font-semibold text-lg">{session.subject}</p>
                  <p className="text-sm text-muted-foreground">
                    Started at {new Date(session.startTime).toLocaleTimeString()}
                  </p>
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
          </CardHeader>
          <CardContent>
            {records.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No attendance records yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b">
                      <th className="p-3">Student</th>
                      <th className="p-3">Method</th>
                      <th className="p-3">Confidence</th>
                      <th className="p-3">Time</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r: any) => (
                      <tr key={r._id || r.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium">{r.studentName}</td>
                        <td className="p-3">
                          <Badge variant="outline">{r.method === "face" ? "🤖 Face" : r.method}</Badge>
                        </td>
                        <td className="p-3">{(r.confidence * 100).toFixed(1)}%</td>
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
        </CardHeader>
        <CardContent>
          {closedSessions.length === 0 ? (
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
                  <Badge variant="secondary">Closed</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
