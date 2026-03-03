import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingUp, MessageSquare, Star, Medal, Award } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Teacher } from "@shared/schema";

interface LeaderboardItem extends Teacher {
  rank: number;
  improvement?: number;
}

interface LeaderboardProps {
  type: "top-rated" | "most-feedback" | "most-improved";
  limit?: number;
  title?: string;
  showRank?: boolean;
  className?: string;
}

const getRankIcon = (rank: number) => {
  if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
  if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
  return <span className="text-sm font-bold text-muted-foreground w-5 h-5 flex items-center justify-center rounded-full bg-muted">{rank}</span>;
};

const getRankBadgeColor = (rank: number) => {
  if (rank === 1) return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
  if (rank === 2) return "bg-gray-400/10 text-gray-600 border-gray-400/20";
  if (rank === 3) return "bg-amber-600/10 text-amber-600 border-amber-600/20";
  return "bg-muted text-muted-foreground";
};

export function Leaderboard({ type, limit = 10, title, showRank = true, className }: LeaderboardProps) {
  const { data: teachers = [], isLoading } = useQuery<LeaderboardItem[]>({
    queryKey: [`/api/leaderboard/${type}?limit=${limit}`],
  });

  const defaultTitles = {
    "top-rated": "Top Rated Teachers",
    "most-feedback": "Most Feedback Received",
    "most-improved": "Most Improved",
  };

  const displayTitle = title || defaultTitles[type];

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            {displayTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(limit)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-lg border">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (teachers.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            {displayTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No data available yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("animate-fadeIn", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {type === "top-rated" && <Trophy className="h-5 w-5 text-yellow-500" />}
          {type === "most-feedback" && <MessageSquare className="h-5 w-5 text-blue-500" />}
          {type === "most-improved" && <TrendingUp className="h-5 w-5 text-green-500" />}
          {displayTitle}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {teachers.map((teacher, index) => (
            <div
              key={teacher.id}
              className={cn(
                "flex items-center gap-4 p-4 rounded-lg border transition-all hover:bg-muted/50 animate-slideInUp",
                index === 0 && "bg-yellow-500/5 border-yellow-500/20",
                index === 1 && "bg-gray-400/5 border-gray-400/20",
                index === 2 && "bg-amber-600/5 border-amber-600/20"
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {showRank && (
                <div className="flex-shrink-0">
                  {getRankIcon(teacher.rank)}
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-sm truncate">{teacher.name}</h4>
                  {teacher.rank <= 3 && (
                    <Badge variant="outline" className={cn("text-xs", getRankBadgeColor(teacher.rank))}>
                      #{teacher.rank}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="truncate">{teacher.subject}</span>
                  <span>•</span>
                  <span>{teacher.department}</span>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                {type === "top-rated" && (
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                    <span className="font-semibold text-sm">
                      {teacher.averageRating?.toFixed(1) || "0.0"}
                    </span>
                  </div>
                )}
                
                {type === "most-feedback" && (
                  <div className="flex items-center gap-1">
                    <MessageSquare className="h-4 w-4 text-blue-500" />
                    <span className="font-semibold text-sm">{teacher.totalFeedback || 0}</span>
                  </div>
                )}

                {type === "most-improved" && teacher.improvement !== undefined && (
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span className="font-semibold text-sm text-green-600">
                      +{teacher.improvement.toFixed(1)}
                    </span>
                  </div>
                )}

                {type === "top-rated" && teacher.totalFeedback && (
                  <div className="text-xs text-muted-foreground">
                    ({teacher.totalFeedback} reviews)
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

