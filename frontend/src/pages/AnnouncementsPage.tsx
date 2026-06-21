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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Bell, Plus, Trash2, AlertTriangle, Info, Megaphone, Calendar, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const API = "";

function getHeaders() {
  const token = localStorage.getItem("token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

const priorityConfig = {
  normal:    { label: "Normal",    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",    icon: Info },
  important: { label: "Important", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20", icon: AlertTriangle },
  urgent:    { label: "Urgent",    color: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",         icon: Megaphone },
};

function AnnouncementCard({ ann, canDelete, onDelete }: { ann: any; canDelete: boolean; onDelete: () => void }) {
  const cfg = priorityConfig[ann.priority as keyof typeof priorityConfig] || priorityConfig.normal;
  const Icon = cfg.icon;
  const expired = ann.expiresAt && new Date(ann.expiresAt) < new Date();

  return (
    <Card className={`glass-card hover-lift transition-all overflow-hidden ${expired ? "opacity-50" : ""}`}>
      <div className={`h-1 ${ann.priority === "urgent" ? "bg-gradient-to-r from-red-500 to-rose-400" : ann.priority === "important" ? "bg-gradient-to-r from-amber-500 to-yellow-400" : "bg-gradient-to-r from-blue-500 to-cyan-400"}`} />
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.color} border`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="font-semibold text-sm">{ann.title}</h3>
                <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>{cfg.label}</Badge>
                {expired && <Badge variant="outline" className="text-[10px] text-muted-foreground">Expired</Badge>}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{ann.body}</p>
              <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><User className="h-3 w-3" />{ann.teacherName}</span>
                <Badge variant="outline" className="text-[10px]">{ann.subject}</Badge>
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDistanceToNow(new Date(ann.createdAt), { addSuffix: true })}</span>
                {ann.expiresAt && (
                  <span>Expires {formatDistanceToNow(new Date(ann.expiresAt), { addSuffix: true })}</span>
                )}
              </div>
            </div>
          </div>
          {canDelete && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ComposeDialog({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", subject: "", priority: "normal", expiresAt: "" });

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(withApiBase("/api/announcements"), {
        method: "POST", headers: getHeaders(),
        body: JSON.stringify({ ...form, expiresAt: form.expiresAt || undefined }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Announcement posted!" });
      setOpen(false);
      setForm({ title: "", body: "", subject: "", priority: "normal", expiresAt: "" });
      onSuccess();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0 gap-2">
          <Plus className="h-4 w-4" /> Post Announcement
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-emerald-500" /> Post Announcement</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <Input placeholder="Title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea placeholder="Message body *" rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <Input placeholder="Subject (e.g. DBMS, OOPs) *" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
            <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="important">Important</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Expires At (optional)</label>
            <Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          </div>
          <Button className="w-full bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0" onClick={() => create.mutate()} disabled={create.isPending || !form.title.trim() || !form.body.trim() || !form.subject.trim()}>
            {create.isPending ? "Posting..." : "Post Announcement"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  const { data: announcements = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/announcements"],
    queryFn: async () => {
      const res = await fetch(withApiBase("/api/announcements"), { headers: getHeaders() });
      if (!res.ok) throw new Error("Failed to load announcements");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(withApiBase(`/api/announcements/${id}`), { method: "DELETE", headers: getHeaders() });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/announcements"] }); toast({ title: "Deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? announcements : announcements.filter((a: any) => a.priority === filter);

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <Bell className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Announcements</h1>
            <p className="text-sm text-muted-foreground">Class notices and important updates</p>
          </div>
        </div>
        {isTeacher && <ComposeDialog onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/announcements"] })} />}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["all", "urgent", "important", "normal"].map((f) => (
          <Button key={f} variant={filter === f ? "default" : "outline"} size="sm"
            className={filter === f ? "bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0" : ""}
            onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)} {f === "all" && `(${announcements.length})`}
          </Button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground/20" />
            <p className="font-medium text-muted-foreground">No announcements yet</p>
            {isTeacher && <p className="text-sm text-muted-foreground/60 mt-1">Post your first announcement above</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((ann: any) => (
            <AnnouncementCard
              key={ann._id || ann.id}
              ann={ann}
              canDelete={isTeacher}
              onDelete={() => deleteMut.mutate(ann._id || ann.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
