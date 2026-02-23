import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TopicFrequency {
  topic: string;
  label: string;
  icon: string;
  count: number;
  percentage: number;
  avgConfidence: number;
}

interface TopicData {
  frequency: TopicFrequency[];
  weakAreas: string[];
  totalFeedback: number;
  topicsDetected: number;
}

interface TopicFrequencyChartProps {
  data: TopicData | null;
  isLoading?: boolean;
}

const TOPIC_COLORS: Record<string, string> = {
  pace: "#8b5cf6",
  clarity: "#3b82f6",
  examples: "#10b981",
  engagement: "#f59e0b",
  content: "#6366f1",
  assessment: "#ec4899",
  communication: "#14b8a6",
  resources: "#f97316",
  support: "#06b6d4",
  organization: "#84cc16",
};

export function TopicFrequencyChart({ data, isLoading }: TopicFrequencyChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">🔍 Weak Topic Detection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Extracting topics...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.frequency.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">🔍 Weak Topic Detection</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No topics detected yet</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.frequency.map(f => ({
    name: f.label,
    count: f.count,
    percentage: f.percentage,
    icon: f.icon,
    topic: f.topic,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          🔍 Weak Topic Detection
          <Badge variant="outline" className="ml-auto">{data.topicsDetected} topics found</Badge>
        </CardTitle>
        <CardDescription>
          Most complained/discussed areas from {data.totalFeedback} feedback entries
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: number, _name: string, props: any) => [
                  `${value} mentions (${props.payload.percentage}%)`,
                  "Frequency",
                ]}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={30}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={TOPIC_COLORS[entry.topic] || "#6366f1"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {data.weakAreas.length > 0 && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">⚠️ Key Areas Needing Attention:</p>
            <div className="flex flex-wrap gap-2">
              {data.weakAreas.map((area, i) => (
                <Badge key={i} variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                  {area}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
