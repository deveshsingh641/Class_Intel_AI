import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "./StarRating";
import { FeedbackTemplates } from "./FeedbackTemplates";
import { Confetti } from "./Confetti";
import { BookOpen, Mic, MicOff } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export interface TeacherData {
  id: string;
  name: string;
  department: string;
  subject: string;
  averageRating: number;
  totalFeedback: number;
}

interface FeedbackFormProps {
  teacher: TeacherData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (teacherId: string, rating: number, comment: string, anonymous: boolean, doubt?: string) => void;
  isSubmitting?: boolean;
}

export function FeedbackForm({ teacher, open, onOpenChange, onSubmit, isSubmitting = false }: FeedbackFormProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionEnabled, setTranscriptionEnabled] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [doubt, setDoubt] = useState("");
  const [isImproving, setIsImproving] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    if (!open) {
      setRating(0);
      setComment("");
      setShowConfetti(false);
      setIsRecording(false);
      setIsTranscribing(false);
      setIsAnonymous(false);
      setDoubt("");
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;

    async function checkTranscription() {
      try {
        const res = await fetch("/api/feedback/transcribe-enabled");
        if (!res.ok) return;
        const data = (await res.json()) as { enabled?: boolean };
        if (!cancelled) {
          setTranscriptionEnabled(!!data.enabled);
        }
      } catch {
        if (!cancelled) {
          setTranscriptionEnabled(false);
        }
      }
    }

    checkTranscription();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleTemplateSelect = (template: string) => {
    setComment(template);
  };

  const sendForTranscription = useCallback(async (blob: Blob) => {
    try {
      setIsTranscribing(true);
      const formData = new FormData();
      formData.append("audio", blob, "feedback.webm");

      const token = localStorage.getItem("token");
      const res = await fetch("/api/feedback/transcribe", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });

      if (!res.ok) {
        let message = "Transcription failed";
        try {
          const data = await res.json();
          message = data.error || data.message || message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      const data = (await res.json()) as { transcript?: string };
      const transcript = (data.transcript || "").trim();

      if (!transcript) {
        alert("Could not understand the audio. Please try again.");
        return;
      }

      setComment((prev) => {
        const base = prev.trim();
        if (!base) return transcript.slice(0, 500);
        const combined = `${base}\n\n[Voice note]: ${transcript}`;
        return combined.slice(0, 500);
      });
    } catch (error: any) {
      console.error("Transcription error:", error);
      alert(error?.message || "Failed to transcribe audio");
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await sendForTranscription(blob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Mic access error:", error);
      alert("Could not access microphone. Please check your browser settings.");
    }
  }, [sendForTranscription]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    setIsRecording(false);
  }, []);

  const handleSubmit = () => {
    if (!teacher || rating === 0) return;
    onSubmit(teacher.id, rating, comment, isAnonymous, doubt.trim() || undefined);
  };

  const handleClose = () => {
    setRating(0);
    setComment("");
    setIsAnonymous(false);
    setDoubt("");
    onOpenChange(false);
  };

  const handleImproveFeedback = useCallback(async () => {
    if (!comment.trim()) return;
    try {
      setIsImproving(true);
      const res = await apiRequest("POST", "/api/ai/improve-feedback", { comment });
      const data = (await res.json()) as { improvedComment?: string };
      const improved = typeof data.improvedComment === "string" ? data.improvedComment : "";

      if (!improved || !improved.trim()) {
        alert("AI could not improve your feedback. Please try again later.");
        return;
      }

      const normalizedImproved = improved.trim();
      if (normalizedImproved === comment.trim()) {
        alert("Your feedback already looks clear and constructive, so no changes were suggested.");
        return;
      }

      setComment(normalizedImproved.slice(0, 500));
    } catch (error: any) {
      console.error("Improve feedback error:", error);
      alert(error?.message || "Failed to improve feedback");
    } finally {
      setIsImproving(false);
    }
  }, [comment]);

  if (!teacher) return null;

  return (
    <>
      <Confetti 
        active={showConfetti} 
        onComplete={() => {
          setTimeout(() => setShowConfetti(false), 1000);
        }} 
      />
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="flex flex-col max-h-[90vh] gap-0 p-0 sm:max-w-lg">
          <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0 border-b">
            <DialogTitle data-testid="dialog-title-feedback">Submit Feedback</DialogTitle>
            <DialogDescription>
              Share your experience with this course
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium" data-testid="text-teacher-feedback-name">{teacher.name}</span>
                  <Badge variant="secondary">{teacher.department}</Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="doubt">Your Doubt (Optional)</Label>
                    <span className="text-xs text-muted-foreground">
                      {doubt.length}/300
                    </span>
                  </div>
                  <Textarea
                    id="doubt"
                    placeholder="Ask any question or doubt you still have about this lecture..."
                    value={doubt}
                    onChange={(e) => setDoubt(e.target.value.slice(0, 300))}
                    className="min-h-[80px] resize-none"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BookOpen className="h-4 w-4" />
                  <span>{teacher.subject}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Your Rating</Label>
                  <div className="flex justify-center py-2">
                    <StarRating
                      rating={rating}
                      size="lg"
                      interactive
                      onRatingChange={setRating}
                    />
                  </div>
                  {rating > 0 && (
                    <p className="text-center text-sm text-muted-foreground" data-testid="text-rating-label">
                      {rating === 1 && "Poor"}
                      {rating === 2 && "Fair"}
                      {rating === 3 && "Good"}
                      {rating === 4 && "Very Good"}
                      {rating === 5 && "Excellent"}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="comment">Your Feedback (Optional)</Label>
                    <div className="flex items-center gap-2">
                      {transcriptionEnabled && (
                        <Button
                          type="button"
                          size="icon"
                          variant={isRecording ? "destructive" : "outline"}
                          onClick={isRecording ? stopRecording : startRecording}
                          disabled={isTranscribing}
                          data-testid="button-voice-feedback"
                        >
                          {isRecording ? (
                            <MicOff className="h-4 w-4" />
                          ) : (
                            <Mic className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      <FeedbackTemplates onSelectTemplate={handleTemplateSelect} />
                      <span className="text-xs text-muted-foreground">
                        {comment.length}/500
                      </span>
                    </div>
                  </div>
                  <Textarea
                    id="comment"
                    placeholder="Share your thoughts about the teaching style, course content, and overall experience..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value.slice(0, 500))}
                    className="min-h-[120px] resize-none"
                    data-testid="input-feedback-comment"
                  />
                  <div className="flex justify-end mt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={handleImproveFeedback}
                      disabled={isImproving || !comment.trim()}
                    >
                      {isImproving ? "Improving..." : "Improve my feedback with AI"}
                    </Button>
                  </div>
                  {isRecording && (
                    <p className="text-xs text-amber-600 mt-1">
                      Recording... click the mic again to stop.
                    </p>
                  )}
                  {isTranscribing && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Converting your voice to text...
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <input
                      id="anonymous"
                      type="checkbox"
                      className="h-4 w-4 rounded border border-input"
                      checked={isAnonymous}
                      onChange={(e) => setIsAnonymous(e.target.checked)}
                    />
                    <Label htmlFor="anonymous" className="text-sm">
                      Submit anonymously
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground max-w-xs text-right">
                    Your name is hidden from teachers, but the system may still use your account to prevent duplicate feedback.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end px-6 py-4 border-t flex-shrink-0">
            <Button variant="outline" onClick={handleClose} data-testid="button-cancel-feedback">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={rating === 0 || isSubmitting}
              data-testid="button-submit-feedback"
            >
              {isSubmitting ? "Submitting..." : "Submit Feedback"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
