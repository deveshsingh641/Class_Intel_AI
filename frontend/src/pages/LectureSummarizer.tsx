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
  Mic, MicOff, FileText, BookOpen, Brain, Clock,
  Sparkles, ChevronDown, ChevronUp, Play, Square
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
  const [isRecording, setIsRecording] = useState(false);
  const [expandedLecture, setExpandedLecture] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const timerRef = useRef<any>(null);
  const isRecordingRef = useRef(false); // Ref to avoid stale closure in recognition.onend

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

  const { data: lecturesRaw = [], isError: lecturesError } = useQuery({
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
      const res = await fetch(`${API}/api/lectures/summarize`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ title, subject, transcript, duration: recordingDuration }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Lecture Summarized!", description: `Generated ${data.flashcards?.length || 0} flashcards.` });
      queryClient.invalidateQueries({ queryKey: ["/api/lectures"] });
      setTitle("");
      setSubject("");
      setTranscript("");
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
      if (event.error === "no-speech") {
        // Silently ignore no-speech errors - recognition will auto-restart via onend
        return;
      }
      // For other errors, stop recording to avoid stuck state
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
      // Use ref instead of state to avoid stale closure
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

  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Brain className="h-8 w-8 text-primary" />
          AI Lecture Summarizer
        </h1>
        <p className="text-muted-foreground mt-1">
          {isTeacher
            ? "Record or paste lecture content — AI generates summaries and flashcards"
            : "Browse lecture summaries and flashcards"}
        </p>
      </div>

      {/* Teacher: Create Lecture Summary */}
      {isTeacher && (
        <Card className="border-2 border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              New Lecture
            </CardTitle>
            <CardDescription>Record live or paste transcript for AI analysis</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input placeholder="Lecture Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            {/* Speech Recording */}
            <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 border">
              {!isRecording ? (
                <Button onClick={startRecording} className="gap-2 bg-red-600 hover:bg-red-700">
                  <Mic className="h-4 w-4" /> Start Recording
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
                {isRecording ? "Listening..." : "Or paste transcript below"}
              </span>
            </div>

            <Textarea
              placeholder="Lecture transcript will appear here during recording, or paste your content..."
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {transcript.split(/\s+/).filter(Boolean).length} words
              </span>
              <Button
                onClick={() => summarizeMutation.mutate()}
                disabled={!title.trim() || !transcript.trim() || summarizeMutation.isPending}
                className="gap-2"
              >
                {summarizeMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Summary & Flashcards
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lectures List */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          {isTeacher ? "Your Lectures" : "Available Lectures"}
        </h2>

        {lectures.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No lectures yet. {isTeacher ? "Create your first lecture above!" : "Check back later."}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {lectures.map((lecture: any) => {
              const isExpanded = expandedLecture === (lecture._id || lecture.id);
              return (
                <Card key={lecture._id || lecture.id} className="hover:shadow-md transition-shadow">
                  <CardHeader
                    className="cursor-pointer"
                    onClick={() => setExpandedLecture(isExpanded ? null : (lecture._id || lecture.id))}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{lecture.title}</CardTitle>
                        <CardDescription className="flex items-center gap-3 mt-1">
                          <Badge variant="outline">{lecture.subject}</Badge>
                          {lecture.duration > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDuration(lecture.duration)}
                            </span>
                          )}
                          <span>{new Date(lecture.createdAt).toLocaleDateString()}</span>
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-600">{(lecture.flashcards || []).length} flashcards</Badge>
                        {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="space-y-6 border-t pt-4">
                      {/* Summary */}
                      <div>
                        <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                          <Brain className="h-4 w-4 text-primary" /> AI Summary
                        </h3>
                        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 whitespace-pre-wrap">
                          {lecture.summary || "No summary available"}
                        </div>
                      </div>

                      {/* Key Topics */}
                      {(lecture.keyTopics || []).length > 0 && (
                        <div>
                          <h3 className="font-semibold mb-2">Key Topics</h3>
                          <div className="flex flex-wrap gap-2">
                            {(lecture.keyTopics || []).map((topic: string, i: number) => (
                              <Badge key={i} variant="secondary" className="text-sm">{topic}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Flashcards */}
                      {(lecture.flashcards || []).length > 0 && (
                        <div>
                          <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-yellow-500" />
                            Flashcards
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
      className="cursor-pointer min-h-[120px] p-4 rounded-lg border-2 transition-all duration-300 hover:shadow-lg"
      style={{
        backgroundColor: flipped ? "hsl(var(--primary) / 0.05)" : "hsl(var(--muted) / 0.5)",
        borderColor: flipped ? "hsl(var(--primary) / 0.3)" : "transparent",
      }}
    >
      <div className="flex items-start gap-2">
        <span className="text-xs font-bold bg-primary/10 text-primary rounded-full h-6 w-6 flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        <div>
          <p className="font-medium text-sm">{flipped ? "Answer:" : "Question:"}</p>
          <p className="mt-1">{flipped ? answer : question}</p>
          {!flipped && (
            <p className="text-xs text-muted-foreground mt-2">Click to reveal answer</p>
          )}
        </div>
      </div>
    </div>
  );
}
