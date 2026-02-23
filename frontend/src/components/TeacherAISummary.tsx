import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface TeacherAISummaryProps {
  teacherId: string;
}

export function TeacherAISummary({ teacherId }: TeacherAISummaryProps) {
  const { toast } = useToast();

  const { data: summary, refetch, isLoading } = useQuery({
    queryKey: ["teacher-summary", teacherId],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/ai/teacher-summary/${teacherId}`);
        return res.json();
      } catch (error) {
        const err = error as (Error & { status?: number });
        if (err?.status === 404) return null;
        return null;
      }
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/ai/teacher-summary/${teacherId}`);
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({
        title: "Success",
        description: "AI summary generated successfully!",
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
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-500" />
            AI-Generated Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card className="border-2 border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-500" />
            AI-Generated Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-4">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-full flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Generate an AI-powered summary of all feedback for this teacher using advanced natural language processing.
            </p>
            <ul className="text-xs text-muted-foreground text-left max-w-md mx-auto space-y-1 mb-4">
              <li>✨ Comprehensive feedback analysis</li>
              <li>💪 Key strengths identification</li>
              <li>📈 Areas for improvement</li>
              <li>🎯 Overall sentiment analysis</li>
            </ul>
          </div>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="w-full bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-500 hover:to-blue-700"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating AI Summary...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate AI Summary
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-emerald-200 dark:border-emerald-900">
      <CardHeader className="bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-950 dark:to-blue-950">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-500" />
            AI-Generated Summary
          </CardTitle>
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
            AI Powered
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="prose dark:prose-invert max-w-none">
          <p className="text-sm leading-relaxed">{summary.summary}</p>
        </div>

        {summary.strengths && summary.strengths.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2 text-green-700 dark:text-green-400">
              <TrendingUp className="h-4 w-4" />
              Key Strengths
            </h4>
            <div className="flex flex-wrap gap-2">
              {summary.strengths.map((strength: string, idx: number) => (
                <Badge 
                  key={idx} 
                  variant="secondary" 
                  className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700"
                >
                  ✓ {strength}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {summary.improvements && summary.improvements.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <AlertCircle className="h-4 w-4" />
              Areas for Improvement
            </h4>
            <div className="flex flex-wrap gap-2">
              {summary.improvements.map((improvement: string, idx: number) => (
                <Badge 
                  key={idx} 
                  variant="secondary" 
                  className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-orange-300 dark:border-orange-700"
                >
                  → {improvement}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            Generated {new Date(summary.generatedAt).toLocaleDateString()}
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
                Regenerating...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-3 w-3" />
                Regenerate
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
