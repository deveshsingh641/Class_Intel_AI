import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Brain,
  Loader2,
  Target,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface RatingPrediction {
  predictedRating: number;
  trend: "improving" | "declining" | "stable";
  confidence: number;
  reasoning: string;
}

interface AIPredictiveTrendProps {
  teacherId: string;
}

const trendConfig = {
  improving: {
    icon: TrendingUp,
    color: "text-green-600",
    bg: "from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50",
    border: "border-green-200 dark:border-green-800",
    badge: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    label: "Improving",
    emoji: "📈",
  },
  declining: {
    icon: TrendingDown,
    color: "text-red-600",
    bg: "from-red-50 to-orange-50 dark:from-red-950/50 dark:to-orange-950/50",
    border: "border-red-200 dark:border-red-800",
    badge: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    label: "Needs Attention",
    emoji: "📉",
  },
  stable: {
    icon: Minus,
    color: "text-blue-600",
    bg: "from-blue-50 to-green-50 dark:from-blue-950/50 dark:to-green-950/50",
    border: "border-blue-200 dark:border-blue-800",
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    label: "Stable",
    emoji: "➡️",
  },
};

export function AIPredictiveTrend({ teacherId }: AIPredictiveTrendProps) {
  const { data: prediction, isLoading } = useQuery({
    queryKey: ["ai-predict-trend", teacherId],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/ai/predict-trend/${teacherId}`);
        return res.json() as Promise<RatingPrediction>;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!prediction || prediction.predictedRating === 0) {
    return null; // Don't show if no prediction available
  }

  const config = trendConfig[prediction.trend] || trendConfig.stable;
  const TrendIcon = config.icon;
  const confidencePercent = Math.round(prediction.confidence * 100);

  return (
    <Card className={`border ${config.border} overflow-hidden`}>
      <div className={`bg-gradient-to-r ${config.bg} px-4 py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-semibold">AI Rating Prediction</span>
          </div>
          <Badge variant="secondary" className={config.badge}>
            <TrendIcon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </div>
      </div>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Predicted Next Month</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{prediction.predictedRating.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">/5</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Confidence</p>
            <div className="flex items-center gap-1">
              <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    confidencePercent >= 70
                      ? "bg-green-500"
                      : confidencePercent >= 40
                      ? "bg-amber-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${confidencePercent}%` }}
                />
              </div>
              <span className="text-xs font-medium">{confidencePercent}%</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {prediction.reasoning}
        </p>

        <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-1 border-t">
          <Target className="h-3 w-3" />
          <span>Based on historical rating patterns</span>
        </div>
      </CardContent>
    </Card>
  );
}
