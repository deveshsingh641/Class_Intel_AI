import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  Target,
  Loader2,
  RefreshCw,
  MessageSquare,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface WeeklyDigest {
  headline: string;
  ratingTrend: string;
  topStrengths: string[];
  focusAreas: string[];
  studentEngagement: string;
  motivationalNote: string;
  weekSummary: string;
  weekStartDate?: string;
  generatedAt?: string;
}

interface AIWeeklyDigestProps {
  teacherId: string;
}

const trendIcons = {
  improving: { icon: TrendingUp, color: "text-green-600", bg: "bg-green-100 dark:bg-green-900", label: "Improving" },
  declining: { icon: TrendingDown, color: "text-red-600", bg: "bg-red-100 dark:bg-red-900", label: "Declining" },
  stable: { icon: Minus, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900", label: "Stable" },
};

export function AIWeeklyDigest({ teacherId }: AIWeeklyDigestProps) {
  const { toast } = useToast();

  const { data: digest, isLoading, refetch } = useQuery({
    queryKey: ["ai-weekly-digest", teacherId],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/ai/weekly-digest/${teacherId}`);
        return res.json() as Promise<WeeklyDigest>;
      } catch {
        return null;
      }
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/ai/weekly-digest/${teacherId}`);
      return res.json() as Promise<WeeklyDigest>;
    },
    onSuccess: () => {
      refetch();
      toast({
        title: "Weekly digest generated!",
        description: "Your AI-powered performance summary is ready.",
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

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5 text-green-600" />
            AI Weekly Digest
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!digest) {
    return (
      <Card className="border-2 border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5 text-green-600" />
            AI Weekly Digest
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-4">
            <div className="w-14 h-14 mx-auto mb-3 bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center">
              <CalendarDays className="h-7 w-7 text-white" />
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Get a weekly AI-powered performance digest with trends, strengths, and focus areas.
            </p>
            <ul className="text-xs text-muted-foreground text-left max-w-md mx-auto space-y-1 mb-4">
              <li>📊 Rating trend analysis</li>
              <li>💪 Your top strengths this week</li>
              <li>🎯 Areas to focus on</li>
              <li>💬 Student engagement insights</li>
              <li>🌟 Personalized motivation</li>
            </ul>
          </div>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="w-full bg-gradient-to-r from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Digest...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Weekly Digest
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const trend = trendIcons[digest.ratingTrend as keyof typeof trendIcons] || trendIcons.stable;
  const TrendIcon = trend.icon;

  return (
    <Card className="border-2 border-green-200 dark:border-green-900">
      <CardHeader className="bg-gradient-to-r from-green-50 to-teal-50 dark:from-green-950 dark:to-teal-950">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5 text-green-600" />
            AI Weekly Digest
          </CardTitle>
          <Badge variant="secondary" className={`${trend.bg} ${trend.color}`}>
            <TrendIcon className="h-3 w-3 mr-1" />
            {trend.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Headline */}
        <div className="text-center">
          <h3 className="text-lg font-bold bg-gradient-to-r from-green-600 to-teal-600 bg-clip-text text-transparent">
            {digest.headline}
          </h3>
        </div>

        {/* Week Summary */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          {digest.weekSummary}
        </p>

        {/* Strengths & Focus Areas Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Strengths */}
          {digest.topStrengths && digest.topStrengths.length > 0 && (
            <div className="rounded-lg border border-green-200 dark:border-green-800 p-3 bg-green-50/50 dark:bg-green-950/30">
              <h4 className="text-xs font-semibold text-green-700 dark:text-green-400 flex items-center gap-1 mb-2">
                <Star className="h-3 w-3" />
                Top Strengths
              </h4>
              <ul className="space-y-1">
                {digest.topStrengths.map((s: string, idx: number) => (
                  <li key={idx} className="text-xs text-green-800 dark:text-green-300 flex items-start gap-1.5">
                    <span className="mt-0.5">✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Focus Areas */}
          {digest.focusAreas && digest.focusAreas.length > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 p-3 bg-amber-50/50 dark:bg-amber-950/30">
              <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1 mb-2">
                <Target className="h-3 w-3" />
                Focus Areas
              </h4>
              <ul className="space-y-1">
                {digest.focusAreas.map((a: string, idx: number) => (
                  <li key={idx} className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                    <span className="mt-0.5">→</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Student Engagement */}
        {digest.studentEngagement && (
          <div className="flex items-start gap-2 rounded-lg border p-3 bg-blue-50/50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
            <MessageSquare className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Student Engagement</p>
              <p className="text-xs text-blue-800 dark:text-blue-300 mt-0.5">{digest.studentEngagement}</p>
            </div>
          </div>
        )}

        {/* Motivational Note */}
        {digest.motivationalNote && (
          <div className="rounded-lg bg-gradient-to-r from-green-100 to-teal-100 dark:from-green-900/50 dark:to-teal-900/50 p-3 text-center">
            <p className="text-sm text-green-800 dark:text-green-200 font-medium italic">
              "{digest.motivationalNote}"
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            {digest.generatedAt
              ? `Generated ${new Date(digest.generatedAt).toLocaleDateString()}`
              : "AI Generated"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-3 w-3" />
                Refresh Digest
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
