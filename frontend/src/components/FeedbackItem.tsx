import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StarRating } from "./StarRating";
import { FeedbackThread } from "./FeedbackThread";
import { AIFeedbackTags } from "./AIFeedbackTags";
import { formatDistanceToNow } from "date-fns";
import { Reply } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface Feedback {
  id: string;
  studentName: string;
  rating: number;
  comment: string;
  createdAt: Date;
  subject?: string;
  qualityScore?: number;
  commentLength?: number;
  hasComment?: boolean;
}

interface FeedbackItemProps {
  feedback: Feedback;
  showReplies?: boolean;
}

export function FeedbackItem({ feedback, showReplies = true }: FeedbackItemProps) {
  const [showThread, setShowThread] = useState(false);
   const { toast } = useToast();

  const flagMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/feedback/${feedback.id}/flag`);
    },
    onSuccess: () => {
      toast({
        title: "Flag submitted",
        description: "Thanks for reporting. Admins will review.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to flag feedback",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="hover-elevate" data-testid={`feedback-item-${feedback.id}`}>
      <CardContent className="pt-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-muted text-muted-foreground text-sm">
              {(feedback.studentName ?? "S")
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .map((n) => n[0])
                .join("")
                .toUpperCase() || "S"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <p className="font-medium text-sm">{feedback.studentName}</p>
                {feedback.subject && (
                  <p className="text-xs text-muted-foreground">{feedback.subject}</p>
                )}
                {typeof feedback.qualityScore !== "undefined" && (
                  <p className="text-[11px] text-muted-foreground">
                    Quality score: {feedback.qualityScore}/5 · {feedback.hasComment ? "Commented" : "No comment"} · {feedback.commentLength || 0} chars
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <StarRating rating={feedback.rating} size="sm" />
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(feedback.createdAt, { addSuffix: true })}
                </span>
              </div>
            </div>
            {feedback.comment && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feedback.comment}
              </p>
            )}
            {feedback.comment && (
              <AIFeedbackTags feedbackId={feedback.id} />
            )}
            {showReplies && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowThread(!showThread)}
                >
                  <Reply className="h-4 w-4 mr-2" />
                  {showThread ? "Hide Replies" : "View Replies"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => flagMutation.mutate()}
                  disabled={flagMutation.isPending}
                >
                  {flagMutation.isPending ? "Flagging..." : "Flag"}
                </Button>
              </div>
            )}
          </div>
        </div>
        {showReplies && showThread && (
          <FeedbackThread feedbackId={feedback.id} />
        )}
      </CardContent>
    </Card>
  );
}
