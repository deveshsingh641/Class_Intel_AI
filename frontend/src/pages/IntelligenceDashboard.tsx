import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SentimentPieChart } from "@/components/SentimentPieChart";
import { TopicFrequencyChart } from "@/components/TopicFrequencyChart";
import { StudentRiskTable } from "@/components/StudentRiskTable";
import { AISuggestionsPanel } from "@/components/AISuggestionsPanel";
import { AlertSystem } from "@/components/AlertSystem";
import {
  Brain,
  BarChart3,
  Shield,
  Lightbulb,
  Bell,
  Activity,
  Zap,
} from "lucide-react";

export default function IntelligenceDashboard() {
  const { user } = useAuth();

  // Resolve the teacher profile via the backend (uses same chain as feedback/received)
  const { data: teacher, isLoading: teacherLoading } = useQuery<any>({
    queryKey: ["/api/teachers/me"],
    retry: false,
  });
  const teacherId = teacher?.id ?? teacher?._id;

  // AI Service health
  const { data: health } = useQuery<any>({
    queryKey: ["/api/intelligence/health"],
    refetchInterval: 60000,
  });

  // Sentiment data
  const { data: sentimentData, isLoading: sentimentLoading } = useQuery<any>({
    queryKey: [`/api/intelligence/sentiment/${teacherId}`],
    enabled: !!teacherId,
  });

  // Topic data
  const { data: topicData, isLoading: topicLoading } = useQuery<any>({
    queryKey: [`/api/intelligence/topics/${teacherId}`],
    enabled: !!teacherId,
  });

  // Suggestions
  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery<any>({
    queryKey: [`/api/intelligence/suggestions/${teacherId}`],
    enabled: !!teacherId,
  });

  const aiServiceOnline = health?.status === "healthy";

  if (teacherLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-16 space-y-4">
          <Skeleton className="h-16 w-16 rounded-full mx-auto" />
          <Skeleton className="h-6 w-48 mx-auto" />
          <Skeleton className="h-4 w-72 mx-auto" />
        </div>
      </div>
    );
  }

  if (!teacherId) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-16">
          <Brain className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
          <h2 className="text-2xl font-bold mb-2">ClassIntel AI Dashboard</h2>
          <p className="text-muted-foreground">
            No teacher profile linked to your account. Please contact admin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Brain className="h-8 w-8 text-emerald-500" />
            <span className="bg-gradient-to-r from-emerald-500 to-blue-500 bg-clip-text text-transparent">ClassIntel AI</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            AI-powered intelligence dashboard — {teacher?.name} • {teacher?.subject}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={aiServiceOnline ? "default" : "destructive"} className="gap-1.5">
            <Zap className="h-3 w-3" />
            AI Engine: {aiServiceOnline ? "Online" : "Offline"}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Activity className="h-3 w-3" />
            v2.0
          </Badge>
        </div>
      </div>

      {!aiServiceOnline && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="py-3 flex items-center gap-3">
            <Bell className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Python AI Service is not running
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Start it with: <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">cd ai-service && pip install -r requirements.txt && python app.py</code>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs defaultValue="sentiment" className="space-y-6">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="sentiment" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Sentiment</span>
          </TabsTrigger>
          <TabsTrigger value="topics" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Topics</span>
          </TabsTrigger>
          <TabsTrigger value="risk" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Risk</span>
          </TabsTrigger>
          <TabsTrigger value="suggestions" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Lightbulb className="h-4 w-4" />
            <span className="hidden sm:inline">Suggestions</span>
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Alerts</span>
          </TabsTrigger>
        </TabsList>

        {/* Sentiment Tab */}
        <TabsContent value="sentiment" className="space-y-6">
          <SentimentPieChart data={sentimentData} isLoading={sentimentLoading} />
        </TabsContent>

        {/* Topics Tab */}
        <TabsContent value="topics" className="space-y-6">
          <TopicFrequencyChart data={topicData} isLoading={topicLoading} />
        </TabsContent>

        {/* Risk Tab */}
        <TabsContent value="risk" className="space-y-6">
          <StudentRiskTable teacherId={teacherId} />
        </TabsContent>

        {/* Suggestions Tab */}
        <TabsContent value="suggestions" className="space-y-6">
          <AISuggestionsPanel data={suggestionsData} isLoading={suggestionsLoading} />
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-6">
          <AlertSystem teacherId={teacherId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
