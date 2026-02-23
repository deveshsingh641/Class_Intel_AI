import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Bot, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

/** Render simple markdown (bold, bullets, headers, hr) to React elements */
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} className="my-2 border-emerald-200 dark:border-emerald-800" />);
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<br key={i} />);
      continue;
    }

    // Render inline markdown (bold)
    const renderInline = (s: string) => {
      const parts: React.ReactNode[] = [];
      const regex = /\*\*(.+?)\*\*/g;
      let lastIndex = 0;
      let match;
      let k = 0;
      while ((match = regex.exec(s)) !== null) {
        if (match.index > lastIndex) parts.push(s.slice(lastIndex, match.index));
        parts.push(<strong key={k++} className="font-semibold text-foreground">{match[1]}</strong>);
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < s.length) parts.push(s.slice(lastIndex));
      return parts;
    };

    // Italics wrapping
    const isItalic = /^\*[^*]/.test(line.trim()) && line.trim().endsWith("*") && !line.trim().startsWith("**");

    // Bullet point
    if (/^[•\-]\s/.test(line.trim()) || /^\d+\.\s/.test(line.trim())) {
      elements.push(
        <div key={i} className="flex gap-1.5 ml-2 my-0.5">
          <span className="text-emerald-500 shrink-0">{/^\d/.test(line.trim()) ? line.trim().match(/^\d+\./)?.[0] : "•"}</span>
          <span>{renderInline(line.trim().replace(/^[•\-]\s|^\d+\.\s/, ""))}</span>
        </div>
      );
    } else if (isItalic) {
      elements.push(<p key={i} className="italic text-muted-foreground text-xs mt-1">{line.trim().slice(1, -1)}</p>);
    } else {
      elements.push(<p key={i} className="my-0.5">{renderInline(line)}</p>);
    }
  }

  return elements;
}

interface AISmartDoubtAnswerProps {
  question: string;
  teacherId: string;
  existingAnswer?: string | null;
}

export function AISmartDoubtAnswer({ question, teacherId, existingAnswer }: AISmartDoubtAnswerProps) {
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const autoAnswerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/auto-answer-doubt", {
        question,
        teacherId,
      });
      return res.json() as Promise<{ answer: string; isAiGenerated: boolean }>;
    },
    onSuccess: (data) => {
      setAiAnswer(data.answer);
      setIsExpanded(true);
    },
  });

  // If teacher already answered, don't show AI answer option
  if (existingAnswer) return null;

  return (
    <div className="mt-2">
      {!aiAnswer ? (
        <Button
          variant="outline"
          size="sm"
          className="text-xs gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950"
          onClick={() => autoAnswerMutation.mutate()}
          disabled={autoAnswerMutation.isPending}
        >
          {autoAnswerMutation.isPending ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Getting AI Answer...
            </>
          ) : (
            <>
              <Bot className="h-3 w-3" />
              Get Instant AI Answer
            </>
          )}
        </Button>
      ) : (
        <Card className="border-emerald-200 dark:border-emerald-800 bg-gradient-to-r from-emerald-50/50 to-blue-50/50 dark:from-emerald-950/30 dark:to-blue-950/30">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  AI-Generated Answer
                </span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                  Beta
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            </div>
            {isExpanded && (
              <div className="text-sm text-foreground/90 leading-relaxed space-y-0">
                {renderMarkdown(aiAnswer)}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {autoAnswerMutation.isError && (
        <p className="text-xs text-red-500 mt-1">
          {(autoAnswerMutation.error as Error)?.message || "Failed to get AI answer"}
        </p>
      )}
    </div>
  );
}
