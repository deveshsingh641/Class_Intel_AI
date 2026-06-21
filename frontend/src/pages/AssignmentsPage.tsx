import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { withApiBase } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ClipboardList, Plus, Clock, CheckCircle2, AlertCircle, Star, ChevronDown, ChevronUp, Send, FileText, Calendar, User
} from "lucide-react";
import { formatDistanceToNow, format, isPast, differenceInDays } from "date-fns";

function getHeaders(json = false) {
  const token = localStorage.getItem("token");
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function DueBadge({ dueDate }: { dueDate: string }) {
  const due = new Date(dueDate);
  const past = isPast(due);
  const daysLeft = differenceInDays(due, new Date());

  if (past) return <Badge variant="destructive" className="text-[10px]">Overdue</Badge>;
  if (daysLeft <= 2) return <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px]">Due soon</Badge>;
  return <Badge variant="outline" className="text-[10px]">{daysLeft}d left</Badge>;
}

/* ─── Create Assignment Dialog (Teacher) ─── */
function CreateAssignmentDialog({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", subject: "", dueDate: "", maxMarks: "100" });

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(withApiBase("/api/assignments"), {
        method: "POST", headers: getHeaders(true),
        body: JSON.stringify({ ...form, maxMarks: parseInt(form.maxMarks) }),

      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Assignment created!" });
      setOpen(false);
      setForm({ title: "", description: "", subject: "", dueDate: "", maxMarks: "100" });
      onSuccess();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0 gap-2">
          <Plus className="h-4 w-4" /> Create Assignment
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-emerald-500" /> New Assignment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <Input placeholder="Assignment Title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <Textarea placeholder="Description / Instructions *" rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <Input placeholder="Subject (e.g. DBMS) *" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Due Date *</label>
              <Input type="datetime-local" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Max Marks</label>
              <Input type="number" placeholder="100" value={form.maxMarks} onChange={e => setForm({ ...form, maxMarks: e.target.value })} />
            </div>
          </div>
          <Button className="w-full bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0" onClick={() => create.mutate()} disabled={create.isPending || !form.title.trim() || !form.description.trim() || !form.subject.trim() || !form.dueDate}>
            {create.isPending ? "Creating..." : "Create Assignment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Submit Dialog (Student) ─── */
function SubmitDialog({ assignment, onSuccess }: { assignment: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch(withApiBase(`/api/assignments/${assignment._id || assignment.id}/submit`), {
        method: "POST", headers: getHeaders(true), body: JSON.stringify({ text }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Submitted!" });
      setOpen(false);
      setText("");
      onSuccess();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0 gap-1.5">
          <Send className="h-3.5 w-3.5" /> Submit
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-emerald-500" /> Submit: {assignment.title}</DialogTitle>
        </DialogHeader>
        <Textarea placeholder="Write your answer / solution here..." rows={8} value={text} onChange={e => setText(e.target.value)} className="mt-3" />
        <Button className="w-full mt-2 bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0" onClick={() => submit.mutate()} disabled={submit.isPending || !text.trim()}>
          {submit.isPending ? "Submitting..." : "Submit Assignment"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Submissions View (Teacher) ─── */
function SubmissionsPanel({ assignment }: { assignment: any }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const aId = assignment._id || assignment.id;

  const { data: subs = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/assignments/${aId}/submissions`],
    queryFn: async () => {
      const res = await fetch(withApiBase(`/api/assignments/${aId}/submissions`), { headers: getHeaders() });
      if (!res.ok) throw new Error("Failed to load submissions");
      return res.json();
    },
    enabled: open,
  });

  const [grades, setGrades] = useState<Record<string, { grade: string; feedback: string }>>({});

  const gradeMut = useMutation({
    mutationFn: async ({ subId, grade, gradeFeedback }: { subId: string; grade: number; gradeFeedback: string }) => {
      const res = await fetch(withApiBase(`/api/assignments/${aId}/submissions/${subId}/grade`), {
        method: "PUT", headers: getHeaders(true), body: JSON.stringify({ grade, gradeFeedback }),
      });
      if (!res.ok) throw new Error("Failed to grade");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/assignments/${aId}/submissions`] });
      toast({ title: "Graded!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(!open)}>
        <FileText className="h-3.5 w-3.5" /> Submissions
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </Button>
      {open && (
        <div className="mt-3 space-y-2 border-t pt-3">
          {isLoading ? <Skeleton className="h-20" /> : subs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No submissions yet</p>
          ) : subs.map((sub: any) => {
            const subId = sub._id || sub.id;
            const g = grades[subId] || { grade: sub.grade?.toString() || "", feedback: sub.gradeFeedback || "" };
            return (
              <div key={subId} className="bg-muted/30 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{sub.studentName}</span>
                  {sub.grade != null && <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">{sub.grade}/{assignment.maxMarks}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{sub.text}</p>
                <div className="flex gap-2">
                  <Input type="number" placeholder="Grade" className="h-7 text-xs w-20" value={g.grade}
                    onChange={e => setGrades({ ...grades, [subId]: { ...g, grade: e.target.value } })} />
                  <Input placeholder="Feedback (optional)" className="h-7 text-xs flex-1" value={g.feedback}
                    onChange={e => setGrades({ ...grades, [subId]: { ...g, feedback: e.target.value } })} />
                  <Button size="sm" className="h-7 text-xs" onClick={() => gradeMut.mutate({ subId, grade: parseFloat(g.grade), gradeFeedback: g.feedback })}>
                    <CheckCircle2 className="h-3 w-3 mr-1" />Grade
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Assignment Card ─── */
function AssignmentCard({ assignment, role, mySubmissions }: { assignment: any; role: string; mySubmissions: any[] }) {
  const qc = useQueryClient();
  const aId = assignment._id || assignment.id;
  const submitted = mySubmissions.some((s: any) => s.assignmentId === aId);
  const mySub = mySubmissions.find((s: any) => s.assignmentId === aId);

  return (
    <Card className="glass-card hover-lift transition-all overflow-hidden">
      <div className={`h-1 bg-gradient-to-r ${isPast(new Date(assignment.dueDate)) ? "from-red-500 to-rose-400" : "from-emerald-500 to-green-400"}`} />
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-semibold">{assignment.title}</h3>
              <DueBadge dueDate={assignment.dueDate} />
              <Badge variant="outline" className="text-[10px]">{assignment.subject}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{assignment.description}</p>
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><User className="h-3 w-3" />{assignment.teacherName}</span>
              <span className="flex items-center gap-1"><Star className="h-3 w-3" />{assignment.maxMarks} marks</span>
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(assignment.dueDate), "MMM d, h:mm a")}</span>
            </div>
            {role === "student" && submitted && mySub && (
              <div className="mt-2 p-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg text-xs">
                <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Submitted
                </span>
                {mySub.grade != null && <span className="ml-4 text-muted-foreground">Grade: {mySub.grade}/{assignment.maxMarks}</span>}
              </div>
            )}
            {(role === "teacher" || role === "admin") && <div className="mt-3"><SubmissionsPanel assignment={assignment} /></div>}
          </div>
          {role === "student" && !submitted && !isPast(new Date(assignment.dueDate)) && (
            <SubmitDialog assignment={assignment} onSuccess={() => qc.invalidateQueries({ queryKey: ["/api/assignments/my-submissions/all"] })} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Main Page ─── */
export default function AssignmentsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const role = user?.role || "student";

  const { data: assignments = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/assignments"],
    queryFn: async () => {
      const res = await fetch(withApiBase("/api/assignments"), { headers: getHeaders() });
      if (!res.ok) throw new Error("Failed to load assignments");
      return res.json();
    },
  });

  const { data: mySubmissions = [] } = useQuery<any[]>({
    queryKey: ["/api/assignments/my-submissions/all"],
    queryFn: async () => {
      const res = await fetch(withApiBase("/api/assignments/my-submissions/all"), { headers: getHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: role === "student",
  });

  const active = assignments.filter((a: any) => !isPast(new Date(a.dueDate)));
  const past = assignments.filter((a: any) => isPast(new Date(a.dueDate)));
  const submitted = (mySubmissions || []).length;

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
            <ClipboardList className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Assignments</h1>
            <p className="text-sm text-muted-foreground">
              {role === "student" ? `${submitted} submitted · ${active.length} active` : `${assignments.length} total assignments`}
            </p>
          </div>
        </div>
        {(role === "teacher" || role === "admin") && (
          <CreateAssignmentDialog onSuccess={() => qc.invalidateQueries({ queryKey: ["/api/assignments"] })} />
        )}
      </div>

      {/* Stats for students */}
      {role === "student" && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Active", value: active.length, icon: Clock, color: "from-emerald-500 to-green-400" },
            { label: "Submitted", value: submitted, icon: CheckCircle2, color: "from-blue-500 to-indigo-400" },
            { label: "Pending", value: active.length - mySubmissions.filter((s: any) => active.some((a: any) => (a._id || a.id) === s.assignmentId)).length, icon: AlertCircle, color: "from-amber-500 to-orange-400" },
          ].map((s) => (
            <Card key={s.label} className="glass-card">
              <CardContent className="p-4 text-center">
                <s.icon className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <div className={`text-2xl font-bold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="active">
        <TabsList className="glass">
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="space-y-3 mt-4">
          {isLoading ? (
            [1,2,3].map(i => <Skeleton key={i} className="h-36 rounded-2xl" />)
          ) : active.length === 0 ? (
            <Card className="glass-card"><CardContent className="p-12 text-center">
              <ClipboardList className="h-12 w-12 mx-auto mb-3 text-muted-foreground/20" />
              <p className="text-muted-foreground">No active assignments</p>
            </CardContent></Card>
          ) : active.map((a: any) => (
            <AssignmentCard key={a._id || a.id} assignment={a} role={role} mySubmissions={mySubmissions} />
          ))}
        </TabsContent>
        <TabsContent value="past" className="space-y-3 mt-4">
          {past.length === 0 ? (
            <Card className="glass-card"><CardContent className="p-12 text-center">
              <p className="text-muted-foreground">No past assignments</p>
            </CardContent></Card>
          ) : past.map((a: any) => (
            <AssignmentCard key={a._id || a.id} assignment={a} role={role} mySubmissions={mySubmissions} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
