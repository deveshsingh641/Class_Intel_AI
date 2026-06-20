import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getApiBaseUrl } from "@/lib/queryClient";
import {
  Upload, FileText, BookOpen, Trash2, Search, Database,
  Loader2, CornerDownRight, ChevronDown, ChevronUp,
  Lightbulb, File, X, Sparkles, Eye, EyeOff
} from "lucide-react";

const API = getApiBaseUrl();

function getHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function highlightKeywords(text: string, query: string) {
  if (!query.trim()) return text;
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return text;
  const pattern = new RegExp(`(${words.join("|")})`, "gi");
  return text.replace(pattern, "==MARK==$1==ENDMARK==");
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const marked = highlightKeywords(text, query);
  const parts = marked.split(/(==MARK==.*?==ENDMARK==)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith("==MARK==")) {
          const word = part.replace("==MARK==", "").replace("==ENDMARK==", "");
          return (
            <mark key={i} className="bg-yellow-200 dark:bg-yellow-900/60 text-foreground rounded px-0.5">
              {word}
            </mark>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RAGChatbot() {
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <BookOpen className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Study Assistant</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Search indexed course materials, lecture notes, and textbook content
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Search Panel — 2/3 */}
          <div className="lg:col-span-2 space-y-4">
            <SearchPanel />
          </div>

          {/* Sidebar — 1/3 */}
          <div className="space-y-4">
            {isTeacher && <DocumentUploader />}
            <DocumentList isTeacher={isTeacher} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Search Panel ──────────────────────────────────────────────────────────────

function SearchPanel() {
  const [queryText, setQueryText] = useState("");
  const [subject, setSubject] = useState("All Subjects");
  const [tipsExpanded, setTipsExpanded] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    answer: string;
    sources: Array<{ documentTitle: string; subject: string; chunk: string; relevanceScore: number }>;
    studyTips: string[];
    documentsSearched: number;
  } | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available subjects from indexed docs
  const { data: documentsRaw = [] } = useQuery({
    queryKey: ["/api/rag/documents"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/rag/documents`, { headers: getHeaders() });
      if (!res.ok) throw new Error("Failed to load documents");
      return res.json();
    },
  });

  const documents = Array.isArray(documentsRaw) ? documentsRaw : [];
  const subjects = ["All Subjects", ...Array.from(new Set(documents.map((d: any) => d.subject).filter(Boolean))) as string[]];

  const { data: historyRaw = [] } = useQuery({
    queryKey: ["/api/rag/history"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/rag/history`, { headers: getHeaders() });
      if (!res.ok) throw new Error("Failed to load history");
      return res.json();
    },
  });

  const history = Array.isArray(historyRaw) ? historyRaw : [];

  const searchMutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await fetch(`${API}/api/rag/chat`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ question: q, subject: subject === "All Subjects" ? undefined : subject }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      setSearchResults({
        answer: data.answer,
        sources: data.sources || [],
        studyTips: data.studyTips || [],
        documentsSearched: data.documentsSearched ?? 0,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rag/history"] });
    },
    onError: (err: Error) => {
      toast({ title: "Search Failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryText.trim()) return;
    setTipsExpanded(false);
    searchMutation.mutate(queryText);
  };

  const handleHistoryClick = (hist: any) => {
    setQueryText(hist.question);
    setSubject(hist.subject && hist.subject !== "General" ? hist.subject : "All Subjects");
    setSearchResults({
      answer: hist.answer,
      sources: Array.isArray(hist.sources) ? hist.sources : [],
      studyTips: [],
      documentsSearched: 0,
    });
  };

  return (
    <div className="space-y-4">
      {/* Search Form */}
      <Card className="shadow-sm border-primary/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Query Course Knowledge Base
          </CardTitle>
          <CardDescription>
            Search across all indexed notes, lectures, and textbook content.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearchSubmit} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder='e.g. "SQL joins", "OSI model", "Newtons laws"...'
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                disabled={searchMutation.isPending}
                className="flex-1"
              />
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={searchMutation.isPending}
                className="w-full sm:w-44 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {subjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <Button type="submit" disabled={!queryText.trim() || searchMutation.isPending} className="gap-2 shrink-0">
                {searchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Results */}
      {searchMutation.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : searchResults ? (
        <div className="space-y-4">
          {/* Answer card */}
          <Card className="border-l-4 border-l-emerald-500 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">Best Match</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {searchResults.documentsSearched} doc{searchResults.documentsSearched !== 1 ? "s" : ""} searched
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{searchResults.answer}</p>
            </CardContent>
          </Card>

          {/* Source snippets */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                <span>Matching Passages</span>
                <Badge variant="secondary">{searchResults.sources.length} matched</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {searchResults.sources.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No exact passage matches found. Try different keywords.</p>
              ) : (
                <div className="divide-y">
                  {searchResults.sources.map((src, i) => (
                    <div key={i} className="p-4 space-y-2 hover:bg-muted/10 transition-colors">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-semibold text-sm flex items-center gap-1.5">
                          <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                          {src.documentTitle}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {src.subject && (
                            <Badge variant="outline" className="text-xs">{src.subject}</Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-xs ${src.relevanceScore >= 70 ? "border-emerald-500 text-emerald-600" : src.relevanceScore >= 40 ? "border-amber-500 text-amber-600" : "border-muted-foreground text-muted-foreground"}`}
                          >
                            {src.relevanceScore}% match
                          </Badge>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground leading-relaxed pl-5 relative">
                        <CornerDownRight className="h-4 w-4 absolute left-0 top-0.5 text-muted-foreground/40" />
                        <p className="italic">
                          "<HighlightedText text={src.chunk} query={queryText} />"
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Study Tips */}
          {searchResults.studyTips.length > 0 && (
            <Card className="border-amber-200 dark:border-amber-900/40 shadow-sm">
              <CardHeader className="pb-2 cursor-pointer" onClick={() => setTipsExpanded(!tipsExpanded)}>
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <Lightbulb className="h-4 w-4" />
                    AI Study Tips
                  </span>
                  {tipsExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </CardTitle>
              </CardHeader>
              {tipsExpanded && (
                <CardContent className="pt-0 space-y-2">
                  {searchResults.studyTips.map((tip, i) => (
                    <div key={i} className="flex gap-2 text-sm p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                      <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-foreground/80 leading-relaxed">{tip}</p>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          )}
        </div>
      ) : (
        <Card className="border-dashed shadow-none">
          <CardContent className="py-20 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/5 ring-1 ring-primary/10 flex items-center justify-center">
              <Search className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <div>
              <h3 className="font-semibold text-muted-foreground">Ready to search</h3>
              <p className="text-xs text-muted-foreground/60 max-w-sm mx-auto mt-1">
                Enter keywords or questions above. The assistant will scan all indexed course materials and return the most relevant passages.
              </p>
            </div>
            {documents.length === 0 && (
              <Badge variant="outline" className="text-xs">
                No documents indexed yet — ask your teacher to upload course notes
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search History */}
      {history.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Recent Searches</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <div className="flex flex-wrap gap-2">
              {history.slice(0, 8).map((hist: any) => (
                <Button
                  key={hist._id || hist.id}
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5 h-7"
                  onClick={() => handleHistoryClick(hist)}
                >
                  <Search className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate max-w-[150px]">{hist.question}</span>
                  {hist.subject && hist.subject !== "General" && (
                    <Badge variant="secondary" className="h-4 px-1 text-[9px]">{hist.subject}</Badge>
                  )}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Document Uploader ─────────────────────────────────────────────────────────

function DocumentUploader() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wc = wordCount(content);
  const chars = content.length;
  const estimatedChunks = chars > 0 ? Math.max(1, Math.ceil(chars / 500)) : 0;

  const wordCountColor =
    wc >= 100 ? "text-emerald-600 dark:text-emerald-400" :
    wc >= 20  ? "text-amber-600 dark:text-amber-400"    :
    wc > 0    ? "text-red-500"                           :
    "text-muted-foreground";

  const parseFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API}/api/rag/documents/parse-file`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to parse file");
      return res.json() as Promise<{ text: string; chars: number; words: number }>;
    },
    onSuccess: (data) => {
      setContent(data.text);
      toast({
        title: "File parsed successfully",
        description: `${data.words.toLocaleString()} words · ${data.chars.toLocaleString()} characters extracted`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "File parse failed", description: err.message, variant: "destructive" });
      setFileName(null);
    },
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^.]+$/, ""));
    }
    parseFileMutation.mutate(file);
    e.target.value = "";
  }, [title, parseFileMutation]);

  const clearFile = () => {
    setFileName(null);
    setContent("");
  };

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
      toast({
        title: "Document Indexed",
        description: `Split into ${data.chunksCount} searchable chunks.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rag/documents"] });
      setTitle("");
      setSubject("");
      setContent("");
      setFileName(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="border-2 border-primary/20 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4" /> Index Study Materials
        </CardTitle>
        <CardDescription className="text-xs">
          Upload a PDF or TXT file, or paste content directly to make it searchable.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Document Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-9 text-sm"
        />
        <Input
          placeholder="Subject (e.g. DBMS, OS, Python)"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="h-9 text-sm"
        />

        {/* File Upload Area */}
        <div
          className="relative border-2 border-dashed border-primary/20 rounded-lg p-3 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md"
            className="hidden"
            onChange={handleFileChange}
          />
          {parseFileMutation.isPending ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-1">
              <Loader2 className="h-4 w-4 animate-spin" />
              Extracting text from file…
            </div>
          ) : fileName ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium truncate">
                <File className="h-4 w-4 shrink-0" />
                {fileName}
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); clearFile(); }}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-1">
              <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground/50" />
              Click to upload <span className="font-medium text-primary">PDF</span>, <span className="font-medium text-primary">TXT</span>, or <span className="font-medium text-primary">Markdown</span>
            </div>
          )}
        </div>

        {/* Paste area */}
        <div className="relative">
          <Textarea
            placeholder="Or paste course text content here…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            className="text-sm resize-y"
          />
        </div>

        {/* Counters */}
        <div className="flex items-center justify-between text-xs">
          <div className={`flex items-center gap-3 ${wordCountColor}`}>
            <span>{wc.toLocaleString()} words · {chars.toLocaleString()} chars</span>
            {estimatedChunks > 0 && (
              <span className="text-muted-foreground">≈ {estimatedChunks} chunk{estimatedChunks !== 1 ? "s" : ""}</span>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => uploadMutation.mutate()}
            disabled={!title.trim() || !content.trim() || uploadMutation.isPending}
            className="gap-1"
          >
            {uploadMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            Index Content
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Document List ─────────────────────────────────────────────────────────────

function DocumentList({ isTeacher }: { isTeacher: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<Record<string, string>>({});
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);

  const { data: documentsRaw = [], isLoading } = useQuery({
    queryKey: ["/api/rag/documents"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/rag/documents`, { headers: getHeaders() });
      if (!res.ok) throw new Error("Failed to load documents");
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

  const handleTogglePreview = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (previewContent[id]) return; // already loaded
    setLoadingPreview(id);
    try {
      const res = await fetch(`${API}/api/rag/documents/${id}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setPreviewContent((prev) => ({ ...prev, [id]: data.content || "" }));
    } catch {
      toast({ title: "Preview unavailable", variant: "destructive" });
      setExpandedId(null);
    } finally {
      setLoadingPreview(null);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4" /> Knowledge Base
          <Badge variant="secondary" className="ml-auto">{documents.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center py-10 px-4 text-center">
            <div className="p-3 rounded-full bg-muted mb-3">
              <BookOpen className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No documents indexed</p>
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-[180px]">
              {isTeacher ? "Upload a PDF or paste notes above to get started." : "Your teacher hasn't uploaded any course materials yet."}
            </p>
          </div>
        ) : (
          <div className="divide-y max-h-[500px] overflow-y-auto">
            {documents.map((doc: any) => {
              const id = doc._id || doc.id;
              const isExpanded = expandedId === id;
              return (
                <div key={id} className="hover:bg-muted/10 transition-colors">
                  <div className="flex items-center justify-between p-3 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">{doc.subject}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleTogglePreview(id)}
                        title={isExpanded ? "Hide preview" : "Preview content"}
                      >
                        {loadingPreview === id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : isExpanded ? (
                          <EyeOff className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </Button>
                      {isTeacher && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => deleteMutation.mutate(id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Expandable Preview */}
                  {isExpanded && (
                    <div className="px-3 pb-3">
                      <div className="rounded-lg bg-muted/40 border text-xs p-3 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed text-muted-foreground font-mono">
                        {previewContent[id] || "Loading…"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
