import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Target,
  CheckCircle2,
  Clock,
  ArrowRight,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ActionItem {
  id: string;
  action: string;
  priority: "high" | "medium" | "low";
  category: string;
  basedOn: string;
  status: string;
  generatedAt: string;
}

interface AIActionItemsProps {
  teacherId: string;
}

const priorityConfig = {
  high: {
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-300 dark:border-red-700",
    icon: AlertTriangle,
    label: "High Priority",
  },
  medium: {
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700",
    icon: Clock,
    label: "Medium Priority",
  },
  low: {
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700",
    icon: ArrowRight,
    label: "Low Priority",
  },
};

const categoryEmoji: Record<string, string> = {
  "teaching-style": "🎓",
  engagement: "💬",
  content: "📚",
  communication: "🗣️",
  assessment: "📝",
  "content-clarity": "🔍",
  pace: "⏱️",
  resources: "📖",
  support: "🤝",
  general: "📌",
};

export function AIActionItems({ teacherId }: AIActionItemsProps) {
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ai-action-items", teacherId],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/ai/action-items/${teacherId}`);
        return res.json() as Promise<{ items: ActionItem[] }>;
      } catch {
        return { items: [] };
      }
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/ai/action-items/${teacherId}`);
      return res.json() as Promise<{ items: ActionItem[] }>;
    },
    onSuccess: () => {
      refetch();
      toast({
        title: "Action items generated",
        description: "AI has analyzed your feedback and created actionable improvement steps.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/ai/action-items/${itemId}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      refetch();
    },
  });

  const items = data?.items || [];
  const pendingItems = items.filter((i) => i.status === "pending" || i.status === "in-progress");
  const completedItems = items.filter((i) => i.status === "completed");

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-blue-600" />
            AI Action Items
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="border-2 border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-blue-600" />
            AI Action Items
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-4">
            <div className="w-14 h-14 mx-auto mb-3 bg-gradient-to-br from-blue-500 to-green-600 rounded-full flex items-center justify-center">
              <Target className="h-7 w-7 text-white" />
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              AI will analyze all your feedback and create specific, actionable improvement steps with priorities.
            </p>
            <ul className="text-xs text-muted-foreground text-left max-w-md mx-auto space-y-1 mb-4">
              <li>🎯 Specific improvement steps based on student feedback</li>
              <li>🔥 Priority levels (high, medium, low)</li>
              <li>📂 Categorized by area (engagement, content, teaching style)</li>
              <li>✅ Track your progress on each item</li>
            </ul>
          </div>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="w-full bg-gradient-to-r from-blue-500 to-green-600 hover:from-blue-600 hover:to-green-700"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing Feedback...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate AI Action Items
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-blue-200 dark:border-blue-900">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-950 dark:to-green-950">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-blue-600" />
            AI Action Items
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              {pendingItems.length} pending
            </Badge>
            {completedItems.length > 0 && (
              <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                {completedItems.length} done
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {pendingItems.map((item) => {
          const config = priorityConfig[item.priority] || priorityConfig.medium;
          const PriorityIcon = config.icon;
          const emoji = categoryEmoji[item.category] || "📌";

          return (
            <div
              key={item.id}
              className="rounded-lg border p-3 space-y-2 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant="outline" className={config.color}>
                      <PriorityIcon className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {emoji} {item.category}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{item.action}</p>
                  {item.basedOn && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      Based on: "{item.basedOn}"
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                  onClick={() => updateStatusMutation.mutate({ itemId: item.id, status: "completed" })}
                  title="Mark as completed"
                >
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}

        {completedItems.length > 0 && (
          <div className="border-t pt-3 mt-3">
            <p className="text-xs text-muted-foreground mb-2 font-medium">Completed Items</p>
            {completedItems.slice(0, 3).map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-sm text-muted-foreground py-1 line-through">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                {item.action}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Regenerating...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-3 w-3" />
                Refresh Action Items
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
