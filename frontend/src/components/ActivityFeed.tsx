import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StarRating } from "./StarRating";
import { MessageSquare, Clock, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Feedback } from "@shared/schema";

interface ActivityItem extends Feedback {
  teacherName: string;
}

export function ActivityFeed({ limit = 10, className }: { limit?: number; className?: string }) {
  const { data: activities = [], isLoading } = useQuery<ActivityItem[]>({
    queryKey: [`/api/activity/recent?limit=${limit}`],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(limit)].map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No recent activity</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("animate-fadeIn", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Recent Activity
          <span className="text-sm font-normal text-muted-foreground ml-auto">
            Live
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative pl-6">
          {/* Vertical timeline line */}
          <div className="absolute left-3 top-0 bottom-0 w-px bg-gradient-to-b from-primary/40 via-primary/20 to-transparent" />

          <div className="space-y-4">
            {activities.map((activity, index) => (
              <div
                key={activity.id}
                className="relative flex items-start gap-4 animate-slideInUp"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                {/* Neon dot */}
                <div className="relative mt-2">
                  <div className="h-3 w-3 rounded-full bg-primary shadow-[0_0_12px_rgba(129,140,248,0.9)]" />
                  <div className="absolute inset-[-6px] rounded-full bg-primary/20 blur-md" />
                </div>

                <div
                  className={cn(
                    "flex-1 min-w-0 rounded-xl border border-primary/15 bg-background/40 px-3 py-3 transition-all hover:border-primary/40 hover:bg-primary/5",
                    index === 0 && "border-primary/40 bg-primary/5"
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                          {(activity.studentName ?? "S")
                            .trim()
                            .split(/\s+/)
                            .filter(Boolean)
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2) || "S"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{activity.studentName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          rated <span className="font-medium">{activity.teacherName}</span>
                        </p>
                      </div>
                    </div>
                    <StarRating rating={activity.rating} size="sm" />
                  </div>

                  {activity.comment && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      "{activity.comment}"
                    </p>
                  )}

                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>
                      {formatDistanceToNow(new Date(activity.createdAt || Date.now()), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

