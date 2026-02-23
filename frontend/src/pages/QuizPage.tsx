import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardList, Plus, AlertTriangle, CheckCircle, XCircle,
  Clock, Shield, Eye, EyeOff, Trophy, BarChart3,
  Trash2, Play, Flag
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

function getHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export default function QuizPage() {
  const { user } = useAuth();
  if (user?.role === "student") return <StudentQuizView />;
  return <TeacherQuizView />;
}

// ─── Teacher Quiz Manager ───────────────────────────────────────────

function TeacherQuizView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [duration, setDuration] = useState(30);
  const [questions, setQuestions] = useState<Array<{
    question: string;
    options: string[];
    correctAnswer: number;
    points: number;
  }>>([{ question: "", options: ["", "", "", ""], correctAnswer: 0, points: 10 }]);
  const [selectedQuiz, setSelectedQuiz] = useState<string | null>(null);

  const { data: quizzes = [] } = useQuery({
    queryKey: ["/api/quizzes"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/quizzes`, { headers: getHeaders() });
      return res.json();
    },
  });

  const { data: attempts = [] } = useQuery({
    queryKey: ["/api/quizzes/attempts", selectedQuiz],
    queryFn: async () => {
      if (!selectedQuiz) return [];
      const res = await fetch(`${API}/api/quizzes/${selectedQuiz}/attempts`, { headers: getHeaders() });
      return res.json();
    },
    enabled: !!selectedQuiz,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/quizzes`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ title, subject, duration, questions }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Quiz Created!" });
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      setShowCreate(false);
      setTitle("");
      setSubject("");
      setQuestions([{ question: "", options: ["", "", "", ""], correctAnswer: 0, points: 10 }]);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (quizId: string) => {
      const res = await fetch(`${API}/api/quizzes/${quizId}/toggle`, {
        method: "PATCH",
        headers: getHeaders(),
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] }),
  });

  const addQuestion = () => {
    setQuestions(prev => [...prev, { question: "", options: ["", "", "", ""], correctAnswer: 0, points: 10 }]);
  };

  const removeQuestion = (index: number) => {
    if (questions.length <= 1) return;
    setQuestions(prev => prev.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, field: string, value: any) => {
    setQuestions(prev => prev.map((q, i) => i === index ? { ...q, [field]: value } : q));
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIndex) return q;
      const newOptions = [...q.options];
      newOptions[oIndex] = value;
      return { ...q, options: newOptions };
    }));
  };

  const flaggedAttempts = (attempts as any[]).filter((a: any) => a.isFlagged);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ClipboardList className="h-8 w-8 text-primary" />
            Quiz Management
          </h1>
          <p className="text-muted-foreground mt-1">Create quizzes with AI-powered cheating detection</p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)} className="gap-2">
          <Plus className="h-4 w-4" /> Create Quiz
        </Button>
      </div>

      {/* Create Quiz Form */}
      {showCreate && (
        <Card className="border-2 border-primary/30">
          <CardHeader>
            <CardTitle>Create New Quiz</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input placeholder="Quiz Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Input type="number" placeholder="Duration (min)" value={duration} onChange={(e) => setDuration(Number(e.target.value))} min={1} max={180} />
              </div>
            </div>

            {questions.map((q, qIndex) => (
              <Card key={qIndex} className="bg-muted/30">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Question {qIndex + 1}</span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="w-20"
                        value={q.points}
                        onChange={(e) => updateQuestion(qIndex, "points", Number(e.target.value))}
                        min={1}
                        placeholder="Points"
                      />
                      {questions.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => removeQuestion(qIndex)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <Textarea
                    placeholder="Enter question..."
                    value={q.question}
                    onChange={(e) => updateQuestion(qIndex, "question", e.target.value)}
                    rows={2}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {q.options.map((opt, oIndex) => (
                      <div key={oIndex} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${qIndex}`}
                          checked={q.correctAnswer === oIndex}
                          onChange={() => updateQuestion(qIndex, "correctAnswer", oIndex)}
                          className="accent-green-600"
                        />
                        <Input
                          placeholder={`Option ${String.fromCharCode(65 + oIndex)}`}
                          value={opt}
                          onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                          className={q.correctAnswer === oIndex ? "border-green-500" : ""}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}

            <div className="flex justify-between">
              <Button variant="outline" onClick={addQuestion} className="gap-2">
                <Plus className="h-4 w-4" /> Add Question
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !title.trim() || !subject.trim() || questions.some(q => !q.question.trim() || q.options.some(o => !o.trim()))}
              >
                {createMutation.isPending ? "Creating..." : "Create Quiz"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quiz List */}
      <div className="grid gap-4">
        {(quizzes as any[]).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No quizzes yet. Create your first quiz!</p>
            </CardContent>
          </Card>
        ) : (
          (quizzes as any[]).map((quiz: any) => (
            <Card key={quiz._id || quiz.id} className={selectedQuiz === (quiz._id || quiz.id) ? "ring-2 ring-primary" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{quiz.title}</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-3">
                      <Badge variant="outline">{quiz.subject}</Badge>
                      <span>{quiz.questions?.length || 0} questions</span>
                      <span>{quiz.duration} min</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={quiz.isActive ? "default" : "secondary"}>
                      {quiz.isActive ? "Active" : "Closed"}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleMutation.mutate(quiz._id || quiz.id)}
                    >
                      {quiz.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedQuiz(selectedQuiz === (quiz._id || quiz.id) ? null : (quiz._id || quiz.id))}
                      className="gap-1"
                    >
                      <BarChart3 className="h-4 w-4" /> Results
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Attempt Results */}
      {selectedQuiz && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Quiz Results & Proctoring Report
            </CardTitle>
            {flaggedAttempts.length > 0 && (
              <Badge variant="destructive" className="w-fit gap-1">
                <AlertTriangle className="h-3 w-3" /> {flaggedAttempts.length} flagged for cheating
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {(attempts as any[]).length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No attempts yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b font-medium">
                      <th className="p-3">Student</th>
                      <th className="p-3">Score</th>
                      <th className="p-3">%</th>
                      <th className="p-3">Tab Switches</th>
                      <th className="p-3">Copy-Paste</th>
                      <th className="p-3">Cheating Score</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(attempts as any[]).map((a: any) => (
                      <tr key={a._id || a.id} className={`border-b ${a.isFlagged ? "bg-red-50 dark:bg-red-500/10" : ""}`}>
                        <td className="p-3 font-medium">{a.studentName}</td>
                        <td className="p-3">{a.score}/{a.totalPoints}</td>
                        <td className="p-3">
                          <Badge variant={a.percentage >= 70 ? "default" : a.percentage >= 50 ? "secondary" : "destructive"}>
                            {a.percentage}%
                          </Badge>
                        </td>
                        <td className="p-3">
                          <span className={a.tabSwitches > 3 ? "text-red-600 font-bold" : ""}>{a.tabSwitches}</span>
                        </td>
                        <td className="p-3">
                          <span className={a.copyPasteAttempts > 0 ? "text-red-600 font-bold" : ""}>{a.copyPasteAttempts}</span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${a.cheatingScore >= 60 ? "bg-red-500" : a.cheatingScore >= 30 ? "bg-yellow-500" : "bg-green-500"}`}
                                style={{ width: `${a.cheatingScore}%` }}
                              />
                            </div>
                            <span className="text-xs">{a.cheatingScore}%</span>
                          </div>
                        </td>
                        <td className="p-3">
                          {a.isFlagged ? (
                            <Badge variant="destructive" className="gap-1">
                              <Flag className="h-3 w-3" /> Flagged
                            </Badge>
                          ) : (
                            <Badge variant="default" className="bg-green-600 gap-1">
                              <CheckCircle className="h-3 w-3" /> Clean
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
    </div>
  );
}

// ─── Student Quiz View ──────────────────────────────────────────────

function StudentQuizView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeQuiz, setActiveQuiz] = useState<any>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [copyPasteAttempts, setCopyPasteAttempts] = useState(0);
  const [rightClickAttempts, setRightClickAttempts] = useState(0);
  const [quizResult, setQuizResult] = useState<any>(null);
  const timerRef = useRef<any>(null);

  const { data: quizzes = [] } = useQuery({
    queryKey: ["/api/quizzes"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/quizzes`, { headers: getHeaders() });
      return res.json();
    },
  });

  // Anti-cheating: track tab switches
  useEffect(() => {
    if (!activeQuiz) return;
    const handleVisibility = () => {
      if (document.hidden) {
        setTabSwitches(prev => prev + 1);
      }
    };
    const handleCopy = (e: Event) => {
      e.preventDefault();
      setCopyPasteAttempts(prev => prev + 1);
    };
    const handlePaste = (e: Event) => {
      e.preventDefault();
      setCopyPasteAttempts(prev => prev + 1);
    };
    const handleContextMenu = (e: Event) => {
      e.preventDefault();
      setRightClickAttempts(prev => prev + 1);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [activeQuiz]);

  // Timer
  useEffect(() => {
    if (!activeQuiz || timeLeft <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          submitQuiz();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [activeQuiz, timeLeft > 0]);

  const startQuiz = (quiz: any) => {
    setActiveQuiz(quiz);
    setAnswers(new Array(quiz.questions.length).fill(-1));
    setTimeLeft(quiz.duration * 60);
    setTabSwitches(0);
    setCopyPasteAttempts(0);
    setRightClickAttempts(0);
    setQuizResult(null);
  };

  const submitQuiz = useCallback(async () => {
    if (!activeQuiz) return;
    clearInterval(timerRef.current);
    try {
      const res = await fetch(`${API}/api/quizzes/${activeQuiz._id || activeQuiz.id}/submit`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          answers,
          tabSwitches,
          copyPasteAttempts,
          rightClickAttempts,
          suspiciousTimePatterns: 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQuizResult(data);
      setActiveQuiz(null);
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      toast({ title: "Quiz Submitted!", description: `Score: ${data.percentage}%` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }, [activeQuiz, answers, tabSwitches, copyPasteAttempts, rightClickAttempts, queryClient, toast]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Active quiz taking view
  if (activeQuiz) {
    return (
      <div className="container mx-auto p-4 space-y-4 max-w-3xl select-none">
        <div className="flex items-center justify-between sticky top-16 z-40 bg-background/95 backdrop-blur p-4 rounded-lg border shadow-sm">
          <div>
            <h1 className="font-bold text-lg">{activeQuiz.title}</h1>
            <p className="text-sm text-muted-foreground">{activeQuiz.subject}</p>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant={timeLeft < 60 ? "destructive" : "outline"} className="text-lg gap-1 py-1 px-3">
              <Clock className="h-4 w-4" /> {formatTime(timeLeft)}
            </Badge>
            {tabSwitches > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> {tabSwitches} tab switch{tabSwitches > 1 ? "es" : ""}
              </Badge>
            )}
          </div>
        </div>

        {activeQuiz.questions.map((q: any, qIndex: number) => (
          <Card key={qIndex} className={answers[qIndex] >= 0 ? "border-green-500/50" : ""}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="font-bold text-primary bg-primary/10 rounded-full h-8 w-8 flex items-center justify-center shrink-0">
                  {qIndex + 1}
                </span>
                <p className="font-medium pt-1">{q.question}</p>
              </div>
              <div className="space-y-2 ml-11">
                {q.options.map((opt: string, oIndex: number) => (
                  <label
                    key={oIndex}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      answers[qIndex] === oIndex
                        ? "bg-primary/10 border-primary"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${qIndex}`}
                      checked={answers[qIndex] === oIndex}
                      onChange={() => setAnswers(prev => prev.map((a, i) => i === qIndex ? oIndex : a))}
                      className="accent-primary"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
              <div className="ml-11">
                <span className="text-xs text-muted-foreground">{q.points} points</span>
              </div>
            </CardContent>
          </Card>
        ))}

        <div className="flex justify-end sticky bottom-4">
          <Button
            size="lg"
            onClick={submitQuiz}
            className="gap-2 shadow-lg"
          >
            <CheckCircle className="h-5 w-5" /> Submit Quiz
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ClipboardList className="h-8 w-8 text-primary" />
          Quizzes
        </h1>
        <p className="text-muted-foreground mt-1">Take quizzes — AI monitors for fair play</p>
      </div>

      {/* Show result if just submitted */}
      {quizResult && (
        <Card className="border-2 border-green-500/50 bg-green-50 dark:bg-green-500/5">
          <CardContent className="p-6 text-center space-y-3">
            <Trophy className="h-12 w-12 mx-auto text-yellow-500" />
            <h2 className="text-2xl font-bold">Quiz Complete!</h2>
            <div className="text-4xl font-bold text-primary">{quizResult.percentage}%</div>
            <p className="text-muted-foreground">{quizResult.score} / {quizResult.totalPoints} points</p>
            {quizResult.isFlagged && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Proctoring alert flagged
              </Badge>
            )}
            <Button onClick={() => setQuizResult(null)} variant="outline" className="mt-4">Close</Button>
          </CardContent>
        </Card>
      )}

      {/* Available quizzes */}
      {(quizzes as any[]).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No quizzes available right now</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {(quizzes as any[]).map((quiz: any) => (
            <Card key={quiz._id || quiz.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{quiz.title}</h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-3">
                    <Badge variant="outline">{quiz.subject}</Badge>
                    <span>{quiz.questions?.length || 0} questions</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {quiz.duration} min
                    </span>
                  </p>
                </div>
                <div>
                  {quiz.attempted ? (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle className="h-3 w-3" /> Completed ({quiz.myPercentage}%)
                    </Badge>
                  ) : (
                    <Button onClick={() => startQuiz(quiz)} className="gap-2">
                      <Play className="h-4 w-4" /> Start Quiz
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
