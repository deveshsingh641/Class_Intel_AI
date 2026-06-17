import { useState, useRef, useCallback, useEffect } from "react";
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
  Mic, FileText, BookOpen, Clock,
  ChevronDown, ChevronUp, Square, Plus, Trash2, Key
} from "lucide-react";

const API = getApiBaseUrl();

function getHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export default function LectureSummarizer() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [transcript, setTranscript] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [keyTopicsText, setKeyTopicsText] = useState("");
  const [manualFlashcards, setManualFlashcards] = useState<Array<{ question: string; answer: string }>>([
    { question: "", answer: "" }
  ]);

  const [isRecording, setIsRecording] = useState(false);
  const [expandedLecture, setExpandedLecture] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const timerRef = useRef<any>(null);
  const isRecordingRef = useRef(false);

  // Cleanup timer and speech recognition on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
      }
    };
  }, []);

  const { data: lecturesRaw = [] } = useQuery({
    queryKey: ["/api/lectures"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/lectures`, { headers: getHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to load lectures");
      }
      return res.json();
    },
  });

  const lectures = Array.isArray(lecturesRaw) ? lecturesRaw : [];

  const summarizeMutation = useMutation({
    mutationFn: async () => {
      const formattedTopics = keyTopicsText
        ? keyTopicsText.split(",").map(t => t.trim()).filter(Boolean)
        : [];
      const formattedFlashcards = manualFlashcards.filter(
        f => f.question.trim() && f.answer.trim()
      );

      const res = await fetch(`${API}/api/lectures/summarize`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          title,
          subject,
          transcript,
          duration: recordingDuration,
          summary: summaryText.trim() || undefined,
          keyTopics: formattedTopics.length > 0 ? formattedTopics : undefined,
          flashcards: formattedFlashcards.length > 0 ? formattedFlashcards : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Lecture Saved!", description: `Created lecture with ${data.flashcards?.length || 0} flashcards.` });
      queryClient.invalidateQueries({ queryKey: ["/api/lectures"] });
      setTitle("");
      setSubject("");
      setTranscript("");
      setSummaryText("");
      setKeyTopicsText("");
      setManualFlashcards([{ question: "", answer: "" }]);
      setRecordingDuration(0);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const startRecording = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({
        title: "Not Supported",
        description: "Speech recognition is not supported in this browser. Use Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + " ";
        }
      }
      if (finalTranscript) {
        setTranscript(prev => prev + finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "no-speech") return;
      toast({ title: "Recording Error", description: event.error, variant: "destructive" });
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
      }
      isRecordingRef.current = false;
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    recognition.onend = () => {
      if (isRecordingRef.current) {
        try { recognition.start(); } catch {}
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    isRecordingRef.current = true;
    setIsRecording(true);
    setRecordingDuration(0);
    timerRef.current = setInterval(() => {
      setRecordingDuration(prev => prev + 1);
    }, 1000);
  }, [toast]);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const addFlashcard = () => {
    setManualFlashcards([...manualFlashcards, { question: "", answer: "" }]);
  };

  const removeFlashcard = (index: number) => {
    const next = [...manualFlashcards];
    next.splice(index, 1);
    setManualFlashcards(next.length === 0 ? [{ question: "", answer: "" }] : next);
  };

  const updateFlashcard = (index: number, field: "question" | "answer", val: string) => {
    const next = [...manualFlashcards];
    next[index][field] = val;
    setManualFlashcards(next);
  };

  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  return (
    <div className="container mx-auto p-4 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BookOpen className="h-8 w-8 text-primary" />
          Course Notes & Lectures
        </h1>
        <p className="text-muted-foreground mt-1">
          {isTeacher
            ? "Record lectures, paste transcripts, and manually save key summaries & flashcards"
            : "Browse class lecture summaries and study flashcards"}
        </p>
      </div>

      {/* Teacher: Create Lecture Summary */}
      {isTeacher && (
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="text-xl">Publish Lecture Materials</CardTitle>
            <CardDescription>Enter details, notes, and study cards for your students.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Lecture Title</label>
                <Input placeholder="e.g. Intro to MongoDB" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Subject</label>
                <Input placeholder="e.g. Database Systems" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            </div>

            {/* Speech Recording */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Lecture Transcript / Content</label>
              <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 border mb-2">
                {!isRecording ? (
                  <Button onClick={startRecording} className="gap-2 bg-red-600 hover:bg-red-700 text-white">
                    <Mic className="h-4 w-4" /> Record Live Transcript
                  </Button>
                ) : (
                  <Button onClick={stopRecording} variant="destructive" className="gap-2 animate-pulse">
                    <Square className="h-4 w-4" /> Stop Recording
                  </Button>
                )}
                {isRecording && (
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                    <span className="font-mono text-lg">{formatDuration(recordingDuration)}</span>
                  </div>
                )}
                <span className="text-sm text-muted-foreground ml-auto">
                  {isRecording ? "Listening..." : "Or type/paste text content directly"}
                </span>
              </div>
              <Textarea
                placeholder="Type lecture details or record live speech to populate transcript..."
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={5}
                className="font-mono text-sm"
              />
            </div>

            {/* Manual Summary & Topics */}
            <div className="space-y-4 pt-2 border-t">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Lecture Summary (Optional)</label>
                <Textarea
                  placeholder="Summarize the core topics covered in this lecture..."
                  value={summaryText}
                  onChange={(e) => setSummaryText(e.target.value)}
                  rows={3}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Key Topics (Optional, comma-separated)</label>
                <Input
                  placeholder="e.g. Relational vs NoSQL, Document Stores, BSON"
                  value={keyTopicsText}
                  onChange={(e) => setKeyTopicsText(e.target.value)}
                />
              </div>
            </div>

            {/* Manual Flashcards */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Study Flashcards (Optional)</label>
                <Button type="button" variant="outline" size="sm" onClick={addFlashcard} className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> Add Card
                </Button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {manualFlashcards.map((fc, index) => (
                  <div key={index} className="flex gap-2 items-start bg-muted/20 p-2.5 rounded-lg border border-border/40">
                    <div className="flex-1 space-y-2">
                      <Input
                        placeholder="Question / Term"
                        value={fc.question}
                        onChange={(e) => updateFlashcard(index, "question", e.target.value)}
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder="Answer / Definition"
                        value={fc.answer}
                        onChange={(e) => updateFlashcard(index, "answer", e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFlashcard(index)}
                      className="text-destructive hover:bg-destructive/10 h-8 w-8"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <span className="text-sm text-muted-foreground">
                {transcript.split(/\s+/).filter(Boolean).length} words of notes
              </span>
              <Button
                onClick={() => summarizeMutation.mutate()}
                disabled={!title.trim() || !transcript.trim() || summarizeMutation.isPending}
              >
                {summarizeMutation.isPending ? "Saving..." : "Publish Lecture Content"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lectures List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          {isTeacher ? "Published Lectures" : "Available Lectures"}
        </h2>

        {lectures.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-55" />
              <p>No lectures yet. {isTeacher ? "Create your first lecture above!" : "Check back later."}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {lectures.map((lecture: any) => {
              const isExpanded = expandedLecture === (lecture._id || lecture.id);
              return (
                <Card key={lecture._id || lecture.id} className="hover:shadow-sm transition-all border border-border/80">
                  <CardHeader
                    className="cursor-pointer py-4"
                    onClick={() => setExpandedLecture(isExpanded ? null : (lecture._id || lecture.id))}
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">{lecture.title}</CardTitle>
                        <CardDescription className="flex items-center gap-3">
                          <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10">{lecture.subject}</Badge>
                          {lecture.duration > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDuration(lecture.duration)}
                            </span>
                          )}
                          <span>{new Date(lecture.createdAt).toLocaleDateString()}</span>
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="font-semibold text-emerald-600 bg-emerald-500/5">
                          {(lecture.flashcards || []).length} Flashcards
                        </Badge>
                        {isExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="space-y-5 border-t pt-4">
                      {/* Summary */}
                      <div>
                        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">Summary & Key Concepts</h3>
                        <div className="p-4 rounded-xl bg-muted/40 border whitespace-pre-wrap text-sm leading-relaxed">
                          {lecture.summary || "No summary available"}
                        </div>
                      </div>

                      {/* Key Topics */}
                      {(lecture.keyTopics || []).length > 0 && (
                        <div>
                          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">Key Topics</h3>
                          <div className="flex flex-wrap gap-2">
                            {(lecture.keyTopics || []).map((topic: string, i: number) => (
                              <Badge key={i} variant="secondary" className="text-xs">{topic}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Flashcards */}
                      {(lecture.flashcards || []).length > 0 && (
                        <div>
                          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">Study Cards</h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {(lecture.flashcards || []).map((card: any, i: number) => (
                              <FlashCard key={i} question={card.question} answer={card.answer} index={i} />
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FlashCard({ question, answer, index }: { question: string; answer: string; index: number }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      onClick={() => setFlipped(!flipped)}
      className="cursor-pointer min-h-[100px] p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between"
      style={{
        backgroundColor: flipped ? "hsl(var(--primary) / 0.04)" : "hsl(var(--muted) / 0.3)",
        borderColor: flipped ? "hsl(var(--primary) / 0.25)" : "hsl(var(--border) / 0.8)",
      }}
    >
      <div className="flex items-start gap-2.5">
        <span className="text-[10px] font-bold bg-primary/10 text-primary rounded-full h-5 w-5 flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
            {flipped ? "Answer" : "Question"}
          </p>
          <p className="mt-1 text-sm text-foreground leading-relaxed break-words">{flipped ? answer : question}</p>
        </div>
      </div>
      {!flipped && (
        <p className="text-[10px] text-muted-foreground/80 mt-2 text-right">Click to reveal answer</p>
      )}
    </div>
  );
}
