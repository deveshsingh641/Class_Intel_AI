import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, ArrowUpCircle, ArrowRightCircle, ArrowDownCircle } from "lucide-react";

interface Suggestion {
  suggestion: string;
  priority: "high" | "medium" | "low";
  category: string;
  basedOnTopic: string;
  topicMentions: number;
  topicIcon: string;
}

interface SuggestionsData {
  suggestions: Suggestion[];
  summary: string;
  sentimentOverview: any;
  topicAnalysis: any[];
}

interface AISuggestionsPanelProps {
  data: SuggestionsData | null;
  isLoading?: boolean;
}

const priorityConfig = {
  high: { icon: ArrowUpCircle, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30", badge: "destructive" as const },
  medium: { icon: ArrowRightCircle, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30", badge: "secondary" as const },
  low: { icon: ArrowDownCircle, color: "text-green-500", bg: "bg-green-50 dark:bg-green-950/30", badge: "default" as const },
};

export function AISuggestionsPanel({ data, isLoading }: AISuggestionsPanelProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            AI Improvement Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.suggestions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            AI Improvement Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No suggestions available. More feedback is needed for analysis.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          AI Improvement Suggestions
          <Badge variant="outline" className="ml-auto">{data.suggestions.length} suggestions</Badge>
        </CardTitle>
        <CardDescription>{data.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.suggestions.map((s, idx) => {
          const config = priorityConfig[s.priority] || priorityConfig.medium;
          const Icon = config.icon;

          return (
            <div key={idx} className={`p-3 rounded-lg ${config.bg} border border-transparent hover:border-border transition-colors`}>
              <div className="flex items-start gap-3">
                <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{s.suggestion}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge variant={config.badge} className="text-[10px]">{s.priority}</Badge>
                    <Badge variant="outline" className="text-[10px]">{s.category}</Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {s.topicIcon} Based on: {s.basedOnTopic} ({s.topicMentions} mentions)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
