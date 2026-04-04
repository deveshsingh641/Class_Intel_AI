import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { TrendingUp, BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Teacher } from "@shared/schema";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"];

export function EnhancedAnalytics({ className }: { className?: string }) {
  const teachersQuery = useQuery<Teacher[]>({
    queryKey: ["/api/teachers"],
  });
  const teachers: Teacher[] = Array.isArray(teachersQuery.data) ? teachersQuery.data : [];
  const isLoading = teachersQuery.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Rating Distribution Chart
  const ratingDistribution = [
    { name: "5 Stars", count: teachers.filter((t) => (t.averageRating || 0) >= 4.5 && (t.averageRating || 0) < 5).length },
    { name: "4 Stars", count: teachers.filter((t) => (t.averageRating || 0) >= 3.5 && (t.averageRating || 0) < 4.5).length },
    { name: "3 Stars", count: teachers.filter((t) => (t.averageRating || 0) >= 2.5 && (t.averageRating || 0) < 3.5).length },
    { name: "2 Stars", count: teachers.filter((t) => (t.averageRating || 0) >= 1.5 && (t.averageRating || 0) < 2.5).length },
    { name: "1 Star", count: teachers.filter((t) => (t.averageRating || 0) >= 0 && (t.averageRating || 0) < 1.5).length },
  ];

  // Department Performance
  const departmentData = teachers.reduce((acc, teacher) => {
    const dept = teacher.department || "Unknown";
    if (!acc[dept]) {
      acc[dept] = { department: dept, avgRating: 0, totalFeedback: 0, count: 0 };
    }
    acc[dept].avgRating += teacher.averageRating || 0;
    acc[dept].totalFeedback += teacher.totalFeedback || 0;
    acc[dept].count += 1;
    return acc;
  }, {} as Record<string, { department: string; avgRating: number; totalFeedback: number; count: number }>);

  const departmentChartData = Object.values(departmentData).map((dept) => ({
    department: dept.department,
    avgRating: (dept.avgRating / dept.count).toFixed(1),
    totalFeedback: dept.totalFeedback,
  }));

  // Top 10 Teachers by Rating
  const topTeachers = [...teachers]
    .sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0))
    .slice(0, 10)
    .map((t) => ({
      name: t.name.split(" ")[0], // First name only for chart
      rating: t.averageRating || 0,
      feedback: t.totalFeedback || 0,
    }));

  return (
    <div className={className}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rating Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Rating Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={ratingDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Department Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5" />
              Department Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={departmentChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ department, totalFeedback }) => `${department}: ${totalFeedback}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="totalFeedback"
                >
                  {departmentChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Teachers Comparison */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top 10 Teachers Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={topTeachers}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="rating" stroke="#8884d8" name="Rating" />
                <Line type="monotone" dataKey="feedback" stroke="#82ca9d" name="Feedback Count" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

