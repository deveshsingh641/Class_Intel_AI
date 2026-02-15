import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, Calendar, User, MessageSquare, Clock, TrendingUp, ThumbsUp, Award, Activity } from "lucide-react";
import { FeedbackThread } from "./FeedbackThread";
import type { Feedback } from "@shared/schema";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

interface FeedbackDetailModalProps {
  feedback: Feedback | null;
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackDetailModal({
  feedback,
  isOpen,
  onClose,
}: FeedbackDetailModalProps) {
  if (!feedback) return null;

  const getRatingLabel = (rating: number) => {
    const labels: Record<number, string> = {
      5: "Excellent",
      4: "Very Good",
      3: "Good",
      2: "Fair",
      1: "Poor",
    };
    return labels[rating] || "Unknown";
  };

  const [analysis, setAnalysis] = useState<{
    sentiment: string;
    sentimentScore: number;
    qualityScore: number;
    keywords: string[];
  } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await apiRequest("POST", `/api/ai/analyze-feedback/${feedback.id}`);
      const data = (await res.json()) as {
        sentiment: string;
        sentimentScore: number;
        qualityScore: number;
        keywords: string[];
      };
      setAnalysis({
        sentiment: data.sentiment,
        sentimentScore: data.sentimentScore,
        qualityScore: data.qualityScore,
        keywords: data.keywords || [],
      });
    } catch (error) {
      const err = error as Error;
      setAnalysisError(err.message || "Failed to analyze feedback");
    } finally {
      setAnalyzing(false);
    }
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 4) return "text-green-600 dark:text-green-400";
    if (rating >= 3) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const timeAgo = feedback.createdAt
    ? (() => {
        const now = new Date();
        const created = new Date(feedback.createdAt);
        const diffInSeconds = Math.floor((now.getTime() - created.getTime()) / 1000);
        const diffInMinutes = Math.floor(diffInSeconds / 60);
        const diffInHours = Math.floor(diffInMinutes / 60);
        const diffInDays = Math.floor(diffInHours / 24);
        
        if (diffInDays > 0) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
        if (diffInHours > 0) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
        if (diffInMinutes > 0) return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
        return 'Just now';
      })()
    : 'Unknown';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto animate-fadeScale">
        <DialogHeader className="space-y-4 pb-4 border-b">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                {feedback.studentName}
              </DialogTitle>
              <DialogDescription className="mt-2 flex items-center gap-2">
                <Badge variant="outline" className="hover-scale">
                  {feedback.subject || "General"}
                </Badge>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {timeAgo}
                </span>
              </DialogDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`h-6 w-6 transition-all duration-300 ${
                      i < feedback.rating
                        ? "fill-yellow-400 text-yellow-400 animate-scaleIn"
                        : "text-gray-300 dark:text-gray-600"
                    }`}
                    style={{ animationDelay: `${i * 0.05}s` }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-lg font-bold ${getRatingColor(feedback.rating)}`}>
                  {feedback.rating}/5
                </span>
                <Badge variant="secondary" className={getRatingColor(feedback.rating)}>
                  {getRatingLabel(feedback.rating)}
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Enhanced Meta Information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-lg border border-blue-200 dark:border-blue-800 hover-lift animate-fadeScale">
              <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Submitted</p>
                <p className="font-semibold text-sm">
                  {feedback.createdAt
                    ? new Date(feedback.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "N/A"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {feedback.createdAt
                    ? new Date(feedback.createdAt).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 rounded-lg border border-purple-200 dark:border-purple-800 hover-lift animate-fadeScale" style={{ animationDelay: "0.1s" }}>
              <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Award className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Rating Quality</p>
                <p className={`font-semibold text-sm ${getRatingColor(feedback.rating)}`}>
                  {getRatingLabel(feedback.rating)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {feedback.rating >= 4 ? "Positive" : feedback.rating >= 3 ? "Neutral" : "Needs Improvement"}
                </p>
              </div>
            </div>
            
          </div>

          {/* Enhanced Comment Section */}
          {feedback.comment && (
            <div className="space-y-3 animate-fadeScale" style={{ animationDelay: "0.15s" }}>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-primary" />
                </div>
                <p className="text-sm font-semibold">Full Comment</p>
              </div>
              <div className="p-6 bg-gradient-to-br from-muted/50 to-muted/30 rounded-lg border-2 border-muted-foreground/10 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-purple-500 to-pink-500" />
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground relative z-10">
                  {feedback.comment}
                </p>
                {feedback.comment.length > 200 && (
                  <div className="mt-3 pt-3 border-t border-muted-foreground/10">
                    <p className="text-xs text-muted-foreground">
                      <MessageSquare className="h-3 w-3 inline mr-1" />
                      {feedback.comment.length} characters
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3 p-5 bg-gradient-to-br from-muted/30 to-muted/10 rounded-lg border border-muted-foreground/10 animate-fadeScale" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Technical Details
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between items-center p-2 bg-background/50 rounded">
                <span className="text-muted-foreground font-medium">Feedback ID:</span>
                <code className="bg-muted px-2 py-1 rounded text-xs font-mono hover-scale">
                  {feedback.id}
                </code>
              </div>
              <div className="flex justify-between items-center p-2 bg-background/50 rounded">
                <span className="text-muted-foreground font-medium">Student ID:</span>
                <code className="bg-muted px-2 py-1 rounded text-xs font-mono hover-scale">
                  {feedback.studentId}
                </code>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    AI Analysis
                  </p>
                </div>
                <Button size="sm" variant="outline" disabled={analyzing} onClick={handleAnalyze}>
                  {analyzing ? "Analyzing..." : "Analyze with AI"}
                </Button>
              </div>
              {analysisError && (
                <p className="text-xs text-red-500">
                  {analysisError}
                </p>
              )}
              {analysis && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-2 rounded bg-background/60">
                    <p className="text-muted-foreground font-medium">Sentiment</p>
                    <p className="font-semibold capitalize">{analysis.sentiment}</p>
                    <p className="text-[11px] text-muted-foreground">Score: {analysis.sentimentScore.toFixed(2)}</p>
                  </div>
                  <div className="p-2 rounded bg-background/60">
                    <p className="text-muted-foreground font-medium">Quality Score</p>
                    <p className="font-semibold">{analysis.qualityScore.toFixed(2)}/5</p>
                  </div>
                  <div className="p-2 rounded bg-background/60">
                    <p className="text-muted-foreground font-medium">Keywords</p>
                    <p className="text-[11px] text-muted-foreground">
                      {analysis.keywords.length > 0 ? analysis.keywords.join(", ") : "None detected"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Replies Section */}
          <div className="border-t pt-6 mt-6 animate-fadeScale" style={{ animationDelay: "0.25s" }}>
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Discussion Thread</h3>
            </div>
            <FeedbackThread feedbackId={feedback.id} feedbackComment={feedback.comment} />
          </div>

          {/* Enhanced Action Buttons */}
          <div className="flex gap-3 pt-4 border-t animate-fadeScale" style={{ animationDelay: "0.3s" }}>
            <Button
              variant="outline"
              className="flex-1 hover-lift transition-bounce"
              onClick={onClose}
            >
              Close
            </Button>
            <Button
              className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white hover-lift transition-bounce"
              onClick={onClose}
            >
              <ThumbsUp className="h-4 w-4 mr-2" />
              Acknowledge Feedback
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
