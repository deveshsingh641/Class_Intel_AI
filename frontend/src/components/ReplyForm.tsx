import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Send } from "lucide-react";

interface ReplyFormProps {
  feedbackId: string;
  onSuccess?: () => void;
  feedbackComment?: string | null;
}

export function ReplyForm({ feedbackId, onSuccess, feedbackComment }: ReplyFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");

  const { data: templatesData, isLoading: templatesLoading } = useQuery<{
    templates: string[];
  }, Error>({
    queryKey: ["/api/ai/reply-templates", feedbackId],
    enabled: !!feedbackComment && !!user,
    queryFn: async () => {
      try {
        const res = await apiRequest("POST", "/api/ai/reply-templates", { comment: feedbackComment });
        return (await res.json()) as { templates: string[] };
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Failed to load reply templates");
        toast({
          title: "AI suggestions unavailable",
          description: err.message,
          variant: "destructive",
        });
        throw err;
      }
    },
  });

  const replyMutation = useMutation({
    mutationFn: async (data: { content: string }) => {
      const res = await apiRequest("POST", `/api/feedback/${feedbackId}/replies`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/feedback/${feedbackId}/replies`] });
      setContent("");
      toast({
        title: "Reply posted",
        description: "Your reply has been posted successfully.",
      });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to post reply",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      toast({
        title: "Content required",
        description: "Please enter a reply message.",
        variant: "destructive",
      });
      return;
    }
    replyMutation.mutate({ content: content.trim() });
  };

  if (!user) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-3 mt-4">
      <div className="space-y-2">
        <Label htmlFor="reply-content">Your Reply</Label>
        <Textarea
          id="reply-content"
          placeholder="Write your reply..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[100px] resize-none"
          disabled={replyMutation.isPending}
        />
      </div>

      {feedbackComment && templatesData?.templates?.length ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">AI Suggestions:</p>
          <div className="flex flex-wrap gap-2">
            {templatesData.templates.map((t: string, idx: number) => (
              <button
                key={idx}
                type="button"
                className="text-xs px-3 py-2 rounded-md border bg-muted hover:bg-muted/80 text-left max-w-xs line-clamp-3"
                onClick={() => setContent(t)}
                disabled={replyMutation.isPending}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={replyMutation.isPending || !content.trim()}
          size="sm"
        >
          <Send className="h-4 w-4 mr-2" />
          {replyMutation.isPending ? "Posting..." : "Post Reply"}
        </Button>
      </div>
    </form>
  );
}

