import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tag, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface AIFeedbackTagsProps {
  feedbackId: string;
  existingCategories?: string[];
}

const categoryStyles: Record<string, { emoji: string; color: string }> = {
  "teaching-style": { emoji: "🎓", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
  "content-clarity": { emoji: "🔍", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  engagement: { emoji: "💬", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  pace: { emoji: "⏱️", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  assessment: { emoji: "📝", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  communication: { emoji: "🗣️", color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200" },
  resources: { emoji: "📖", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  support: { emoji: "🤝", color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200" },
  general: { emoji: "📌", color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" },
};

export function AIFeedbackTags({ feedbackId, existingCategories }: AIFeedbackTagsProps) {
  const [categories, setCategories] = useState<string[]>(existingCategories || []);
  const [hasFetched, setHasFetched] = useState(!!existingCategories?.length);

  const categorizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/ai/categorize-feedback/${feedbackId}`);
      return res.json() as Promise<{
        categories: string[];
        primaryCategory: string;
        confidence: number;
      }>;
    },
    onSuccess: (data) => {
      setCategories(data.categories);
      setHasFetched(true);
    },
  });

  if (!hasFetched && categories.length === 0) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-[11px] h-6 px-2 gap-1 text-muted-foreground hover:text-foreground"
        onClick={() => categorizeMutation.mutate()}
        disabled={categorizeMutation.isPending}
      >
        {categorizeMutation.isPending ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Tagging...
          </>
        ) : (
          <>
            <Tag className="h-3 w-3" />
            AI Tag
          </>
        )}
      </Button>
    );
  }

  if (categories.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {categories.map((cat) => {
        const style = categoryStyles[cat] || categoryStyles.general;
        return (
          <Badge
            key={cat}
            variant="secondary"
            className={`text-[10px] px-1.5 py-0 ${style.color}`}
          >
            {style.emoji} {cat}
          </Badge>
        );
      })}
    </div>
  );
}
