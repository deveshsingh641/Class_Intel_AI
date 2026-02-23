import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Smile, Frown, Meh } from "lucide-react";

interface SentimentData {
  aggregate: {
    total: number;
    positive: number;
    negative: number;
    neutral: number;
    positivePercent: number;
    negativePercent: number;
    neutralPercent: number;
    avgPolarity: number;
  };
}

interface SentimentPieChartProps {
  data: SentimentData | null;
  isLoading?: boolean;
}

const COLORS = {
  positive: "#22c55e",
  negative: "#ef4444",
  neutral: "#f59e0b",
};

export function SentimentPieChart({ data, isLoading }: SentimentPieChartProps) {
  const chartData = useMemo(() => {
    if (!data?.aggregate) return [];
    const { positive, negative, neutral } = data.aggregate;
    return [
      { name: "Positive", value: positive, color: COLORS.positive, percent: data.aggregate.positivePercent },
      { name: "Negative", value: negative, color: COLORS.negative, percent: data.aggregate.negativePercent },
      { name: "Neutral", value: neutral, color: COLORS.neutral, percent: data.aggregate.neutralPercent },
    ].filter(d => d.value > 0);
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">📊 Sentiment Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Analyzing sentiment...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.aggregate || data.aggregate.total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">📊 Sentiment Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No feedback data available for analysis</p>
        </CardContent>
      </Card>
    );
  }

  const { aggregate: agg } = data;
  const dominant = agg.positivePercent >= agg.negativePercent && agg.positivePercent >= agg.neutralPercent
    ? "positive"
    : agg.negativePercent >= agg.neutralPercent
    ? "negative"
    : "neutral";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          📊 Sentiment Analysis
          <Badge variant={dominant === "positive" ? "default" : dominant === "negative" ? "destructive" : "secondary"} className="ml-2">
            {dominant === "positive" && <Smile className="h-3 w-3 mr-1" />}
            {dominant === "negative" && <Frown className="h-3 w-3 mr-1" />}
            {dominant === "neutral" && <Meh className="h-3 w-3 mr-1" />}
            {dominant}
          </Badge>
        </CardTitle>
        <CardDescription>
          {agg.total} feedback entries analyzed • Avg polarity: {agg.avgPolarity.toFixed(2)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col lg:flex-row items-center gap-6">
          {/* Pie Chart */}
          <div className="w-full lg:w-1/2 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${percent}%`}
                  labelLine={false}
                >
                  {chartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [`${value} feedback(s)`, name]}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Stats */}
          <div className="w-full lg:w-1/2 space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
              <div className="flex items-center gap-2">
                <Smile className="h-5 w-5 text-green-600" />
                <span className="font-medium">Positive</span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-green-600">{agg.positivePercent}%</span>
                <span className="text-sm text-muted-foreground ml-1">({agg.positive})</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
              <div className="flex items-center gap-2">
                <Frown className="h-5 w-5 text-red-600" />
                <span className="font-medium">Negative</span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-red-600">{agg.negativePercent}%</span>
                <span className="text-sm text-muted-foreground ml-1">({agg.negative})</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30">
              <div className="flex items-center gap-2">
                <Meh className="h-5 w-5 text-amber-600" />
                <span className="font-medium">Neutral</span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-amber-600">{agg.neutralPercent}%</span>
                <span className="text-sm text-muted-foreground ml-1">({agg.neutral})</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
