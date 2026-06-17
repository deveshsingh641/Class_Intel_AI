import { useState } from "react";
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
  Upload, FileText, BookOpen, Trash2, Search, Database,
  Loader2, ArrowRight, CornerDownRight
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
    <div className="container mx-auto p-4 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Search className="h-8 w-8 text-primary" />
          Course Material Search
        </h1>
        <p className="text-muted-foreground mt-1">
          Query local course notes, lectures, and resources using word-matching search
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search Panel */}
        <div className="lg:col-span-2">
          <SearchPanel />
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

// Search Panel
function SearchPanel() {
  const [queryText, setQueryText] = useState("");
  const [subject, setSubject] = useState("");
  const [searchResults, setSearchResults] = useState<{
    answer: string;
    sources: Array<{ documentTitle: string; chunk: string; relevanceScore: number }>;
  } | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

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
        body: JSON.stringify({ question: q, subject: subject.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      setSearchResults({
        answer: data.answer,
        sources: data.sources || [],
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
    searchMutation.mutate(queryText);
  };

  const handleHistoryClick = (hist: any) => {
    setQueryText(hist.question);
    setSubject(hist.subject === "General" ? "" : hist.subject || "");
    setSearchResults({
      answer: hist.answer,
      sources: Array.isArray(hist.sources) ? hist.sources : [],
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Query Course Database
          </CardTitle>
          <CardDescription>
            Enter keywords or questions to fetch relevant sections from study materials.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearchSubmit} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Enter search terms (e.g. BSON format, reltional limits)..."
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                disabled={searchMutation.isPending}
                className="flex-1"
              />
              <Input
                placeholder="Subject (optional)"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={searchMutation.isPending}
                className="w-full sm:w-44"
              />
              <Button type="submit" disabled={!queryText.trim() || searchMutation.isPending} className="gap-2 shrink-0">
                {searchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Results Section */}
      {searchResults ? (
        <div className="space-y-4">
          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">Top Match Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{searchResults.answer}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                <span>Matching Document Snips</span>
                <Badge variant="secondary">{searchResults.sources.length} matched</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {searchResults.sources.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No exact passage matches found in documents.</p>
              ) : (
                <div className="divide-y">
                  {searchResults.sources.map((src, i) => (
                    <div key={i} className="p-4 space-y-2 hover:bg-muted/10 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm flex items-center gap-1.5">
                          <FileText className="h-4 w-4 text-blue-500" />
                          {src.documentTitle}
                        </span>
                        <Badge variant="outline" className="text-xs bg-primary/5">
                          Score: {src.relevanceScore}
                        </Badge>
                      </div>
                      <div className="flex gap-2 text-sm text-muted-foreground leading-relaxed pl-5 relative">
                        <CornerDownRight className="h-4 w-4 absolute left-0 top-0.5 text-muted-foreground/45" />
                        <p className="italic">"{src.chunk}"</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-3">
            <Search className="h-12 w-12 mx-auto text-muted-foreground/30" />
            <h3 className="font-medium text-muted-foreground">Ready to search</h3>
            <p className="text-xs text-muted-foreground/60 max-w-sm mx-auto">
              Enter your query above. The system will scan all uploaded lectures and documents in the knowledge base and list matching snippets.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Search History */}
      {history.length > 0 && (
        <Card>
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

// Document Uploader (Teacher Only)
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
      toast({ title: "Document Uploaded", description: `Parsed and split into ${data.chunksCount} indexes for keyword query.` });
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
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4" /> Index Study Materials
        </CardTitle>
        <CardDescription className="text-xs">
          Input notes, textbook paragraphs, or syllabus info to make them searchable.
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
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="h-9 text-sm"
        />
        <Textarea
          placeholder="Paste course text content here..."
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
            Index Content
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Document List
function DocumentList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  const { data: documentsRaw = [] } = useQuery({
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
            No index documents available
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
