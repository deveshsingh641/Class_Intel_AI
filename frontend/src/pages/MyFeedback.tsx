import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StudentFeedback {
  id: string;
  teacherId: string;
  studentId: string;
  studentName: string;
  isAnonymous: boolean;
  rating: number;
  comment: string | null;
  subject: string | null;
  createdAt: string | null;
  readAt: string | null;
  resolvedAt: string | null;
  teacherName: string | null;
  department: string | null;
}

export default function MyFeedback() {
  const { toast } = useToast();

  const resolveMutation = useMutation({
    mutationFn: async (feedbackId: string) => {
      const res = await apiRequest("POST", `/api/feedback/${feedbackId}/resolve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback/my"] });
      toast({
        title: "Marked as resolved",
        description: "Thanks! This helps teachers know the issue is addressed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to mark resolved",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatus = (item: StudentFeedback) => {
    if (item.resolvedAt) return { label: "Resolved", variant: "secondary" as const };
    if (item.readAt) return { label: "Read", variant: "outline" as const };
    return { label: "Sent", variant: "default" as const };
  };

  const { data: feedback = [], isLoading, error } = useQuery<StudentFeedback[]>({
    queryKey: ["/api/feedback/my"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/feedback/my");
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return res.json();
      }
      const text = await res.text();
      throw new Error(
        text && !text.startsWith("<")
          ? text
          : "Feedback API did not return valid JSON. Please ensure the server is running and the /api/feedback/my route is available."
      );
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="container px-4 md:px-6 py-8">
          <div className="mb-6">
            <Skeleton className="h-9 w-48 mb-2" />
            <Skeleton className="h-5 w-64" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="container px-4 md:px-6 py-8">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-2">Failed to load your feedback</h2>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error
                ? error.message
                : "Unable to fetch your feedback. Please try again later."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="container px-4 md:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">My Feedback</h1>
          <p className="text-muted-foreground mt-1">
            All feedback you have shared with teachers
          </p>
        </div>

        {feedback.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              You haven't submitted any feedback yet. Visit the Teachers page to get started.
            </p>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium">Feedback history</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Teacher</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Anonymous</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Comment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feedback.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.teacherName || "Unknown"}</TableCell>
                        <TableCell>{item.subject || "-"}</TableCell>
                        <TableCell>{item.department || "-"}</TableCell>
                        <TableCell>
                          {item.isAnonymous ? (
                            <Badge variant="secondary">Yes</Badge>
                          ) : (
                            <Badge variant="outline">No</Badge>
                          )}
                        </TableCell>
                        <TableCell>{item.rating}/5</TableCell>
                        <TableCell className="max-w-xs">
                          <span className="line-clamp-2 text-sm text-muted-foreground">
                            {item.comment || "(no comment)"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const status = getStatus(item);
                            return <Badge variant={status.variant}>{status.label}</Badge>;
                          })()}
                        </TableCell>
                        <TableCell>
                          {item.createdAt
                            ? new Date(item.createdAt).toLocaleDateString()
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resolveMutation.mutate(item.id)}
                            disabled={!!item.resolvedAt || resolveMutation.isPending}
                          >
                            {item.resolvedAt ? "Resolved" : resolveMutation.isPending ? "Saving..." : "Mark resolved"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
