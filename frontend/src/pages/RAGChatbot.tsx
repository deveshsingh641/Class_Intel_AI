import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getApiBaseUrl } from "@/lib/queryClient";
import {
  MessageSquare, Upload, FileText, Brain, Send,
  BookOpen, Trash2, Search, Sparkles, Database,
  ArrowRight, Loader2, Bot, User
} from "lucide-react";

const API = getApiBaseUrl();

function getHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export default function RAGChatbot() {
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Brain className="h-8 w-8 text-primary" />
          Smart Study Assistant
        </h1>
        <p className="text-muted-foreground mt-1">
          AI chatbot that answers from uploaded course materials — not the internet
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat Panel */}
        <div className="lg:col-span-2">
          <ChatPanel />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {isTeacher && <DocumentUploader />}
          <DocumentList />
        </div>
      </div>
    </div>
  );
}

// ─── Chat Panel ─────────────────────────────────────────────────────

function ChatPanel() {
  const [question, setQuestion] = useState("");
  const [subject, setSubject] = useState("");
  const [messages, setMessages] = useState<Array<{ role: string; content: string; sources?: any[] }>>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: history = [] } = useQuery({
    queryKey: ["/api/rag/history"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/rag/history`, { headers: getHeaders() });
      return res.json();
    },
  });

  // Load history on first render
  useEffect(() => {
    const historyList = Array.isArray(history) ? history : [];
    if (historyList.length > 0 && messages.length === 0) {
      const loaded = historyList
        .slice()
        .reverse()
        .flatMap((h: any) => [
          { role: "user", content: h.question },
          {
            role: "assistant",
            content: h.answer,
            sources: Array.isArray(h.sources) ? h.sources : [],
          },
        ]);
      setMessages(loaded.slice(-20));
    }
  }, [history, messages.length]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const askMutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await fetch(`${API}/api/rag/chat`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ question: q, subject: subject || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
      }]);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't process your question. Please try again." }]);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setMessages(prev => [...prev, { role: "user", content: question }]);
    askMutation.mutate(question);
    setQuestion("");
  };

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Course-Aware AI Chat
          </CardTitle>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Filter by subject..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-40 h-8 text-xs"
            />
            <Badge variant="outline" className="gap-1">
              <Database className="h-3 w-3" />
              RAG
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 space-y-4">
            <Brain className="h-16 w-16 mx-auto text-muted-foreground opacity-30" />
            <div>
              <h3 className="font-semibold text-lg">Ask about your course materials</h3>
              <p className="text-muted-foreground text-sm mt-1">
                I only answer from uploaded documents — no internet hallucinations!
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {["What are the key topics?", "Explain this concept", "Summarize chapter 3"].map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setQuestion(suggestion);
                  }}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className={`max-w-[80%] space-y-2 ${msg.role === "user" ? "order-first" : ""}`}>
              <div
                className={`rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted rounded-bl-md"
                }`}
              >
                <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
              </div>
              {/* Sources */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="space-y-1 pl-2">
                  <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                    <Search className="h-3 w-3" /> Sources:
                  </p>
                  {msg.sources.map((src: any, j: number) => (
                    <div key={j} className="text-xs p-2 rounded bg-blue-50 dark:bg-blue-500/10 border border-blue-200/50 dark:border-blue-500/20">
                      <span className="font-medium">{src.documentTitle}</span>
                      {src.chunk && (
                        <p className="text-muted-foreground mt-0.5 line-clamp-2">{src.chunk}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-green-600" />
              </div>
            )}
          </div>
        ))}

        {askMutation.isPending && (
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Searching course materials...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </CardContent>

      {/* Input */}
      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            placeholder="Ask a question about your course..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={askMutation.isPending}
            className="flex-1"
          />
          <Button type="submit" disabled={!question.trim() || askMutation.isPending} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}

// ─── Document Uploader (Teacher Only) ───────────────────────────────

function DocumentUploader() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/rag/documents`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ title, subject, content }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Document Uploaded", description: `Split into ${data.chunksCount} chunks for AI search.` });
      queryClient.invalidateQueries({ queryKey: ["/api/rag/documents"] });
      setTitle("");
      setSubject("");
      setContent("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="border-2 border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4" /> Upload Course Material
        </CardTitle>
        <CardDescription className="text-xs">
          Paste notes, textbook chapters, or lecture content
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Document title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-9 text-sm"
        />
        <Input
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="h-9 text-sm"
        />
        <Textarea
          placeholder="Paste your course content here..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          className="text-sm"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{content.length} chars</span>
          <Button
            size="sm"
            onClick={() => uploadMutation.mutate()}
            disabled={!title.trim() || !content.trim() || uploadMutation.isPending}
            className="gap-1"
          >
            {uploadMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            Upload
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Document List ──────────────────────────────────────────────────

function DocumentList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  const { data: documentsRaw = [] } = useQuery({
    queryKey: ["/api/rag/documents"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/rag/documents`, { headers: getHeaders() });
      return res.json();
    },
  });

  const documents = Array.isArray(documentsRaw) ? documentsRaw : [];

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API}/api/rag/documents/${id}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rag/documents"] });
      toast({ title: "Document deleted" });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4" /> Knowledge Base
          <Badge variant="secondary" className="ml-auto">{documents.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No documents uploaded yet
          </p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {documents.map((doc: any) => (
              <div key={doc._id || doc.id} className="flex items-center justify-between p-2 rounded border hover:bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">{doc.subject}</p>
                  </div>
                </div>
                {isTeacher && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => deleteMutation.mutate(doc._id || doc.id)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
