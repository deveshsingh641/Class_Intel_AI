import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ReplyForm } from "./ReplyForm";
import { Trash2, Reply } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Reply {
  id: string;
  feedbackId: string;
  userId: string;
  userName: string;
  userRole: string;
  content: string;
  createdAt: string | Date;
}

interface FeedbackThreadProps {
  feedbackId: string;
  showReplyForm?: boolean;
  feedbackComment?: string | null;
}

export function FeedbackThread({ feedbackId, showReplyForm = true, feedbackComment }: FeedbackThreadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user || (user.role !== "teacher" && user.role !== "admin")) return;
    apiRequest("POST", `/api/feedback/${feedbackId}/read`).catch(() => {
      // best-effort: don't show a toast for this
    });
  }, [feedbackId, user]);

  const { data: replies = [], isLoading } = useQuery<Reply[]>({
    queryKey: [`/api/feedback/${feedbackId}/replies`],
  });

  const deleteMutation = useMutation({
    mutationFn: async (replyId: string) => {
      const res = await apiRequest("DELETE", `/api/replies/${replyId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/feedback/${feedbackId}/replies`] });
      toast({
        title: "Reply deleted",
        description: "The reply has been deleted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete reply",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const roleColors = {
    student: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    teacher: "bg-green-500/10 text-green-600 dark:text-green-400",
    admin: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading replies...</div>;
  }

  return (
    <div className="space-y-4 mt-4">
      {replies.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Replies ({replies.length})</h4>
          {replies.map((reply) => (
            <Card key={reply.id} className="border-l-4 border-l-primary">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {(reply.userName ?? "U")
                          .trim()
                          .split(/\s+/)
                          .filter(Boolean)
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{reply.userName}</span>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${roleColors[reply.userRole as keyof typeof roleColors] || ""}`}
                        >
                          {reply.userRole}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{reply.content}</p>
                    </div>
                  </div>
                  {user && (user.id === reply.userId || user.role === "admin") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(reply.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showReplyForm && user && (
        <div className="border-t pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Reply className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Add a reply</span>
          </div>
          <ReplyForm feedbackId={feedbackId} feedbackComment={feedbackComment} />
        </div>
      )}
    </div>
  );
}

