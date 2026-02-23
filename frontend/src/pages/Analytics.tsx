import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { EnhancedAnalytics } from "@/components/EnhancedAnalytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendChart } from "@/components/charts/TrendChart";
import { ComparisonChart } from "@/components/charts/ComparisonChart";
import { MonthlyPerformanceChart } from "@/components/charts/MonthlyPerformanceChart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, BarChart3, Calendar } from "lucide-react";

interface TrendData {
  date: string;
  count: number;
  avgRating: number;
}

interface MonthlyData {
  month: string;
  count: number;
  avgRating: number;
}

interface ComparisonData {
  department: string;
  avgRating: number;
  totalFeedback: number;
}

export default function Analytics() {
  const { id } = useParams<{ id: string }>();

  const { data: trends = [], isLoading: trendsLoading } = useQuery<TrendData[]>({
    queryKey: [`/api/analytics/teacher/${id}/trends`],
    enabled: !!id,
  });

  const { data: monthly = [], isLoading: monthlyLoading } = useQuery<MonthlyData[]>({
    queryKey: [`/api/analytics/teacher/${id}/monthly`],
    enabled: !!id,
  });

  const { data: departmentComparison = [], isLoading: comparisonLoading } = useQuery<ComparisonData[]>({
    queryKey: [`/api/analytics/departments/comparison`],
  });

  // Only show loading skeleton for queries that are actually fetching
  const isDataLoading = (id ? (trendsLoading || monthlyLoading) : false) || comparisonLoading;

  if (isDataLoading) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-8 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <TrendingUp className="h-8 w-8" />
          Analytics Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">
          Comprehensive insights and performance metrics
        </p>
      </div>

      <Tabs defaultValue="teacher" className="space-y-6">
        <TabsList>
          <TabsTrigger value="teacher" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Teacher Analytics
          </TabsTrigger>
          <TabsTrigger value="department" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Department Comparison
          </TabsTrigger>
        </TabsList>

        <TabsContent value="teacher" className="space-y-6">
          {id && (
            <>
              <TrendChart
                data={trends}
                title="Feedback Trends Over Time"
                description="Track feedback volume and average ratings over time"
              />
              <MonthlyPerformanceChart
                data={monthly}
                title="Monthly Performance Overview"
                description="Monthly breakdown of feedback and ratings"
              />
            </>
          )}
          {!id && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  Select a teacher to view analytics
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="department" className="space-y-6">
          <ComparisonChart
            data={departmentComparison}
            title="Department Performance Comparison"
            description="Compare average ratings and feedback counts across departments"
          />
          <EnhancedAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}

