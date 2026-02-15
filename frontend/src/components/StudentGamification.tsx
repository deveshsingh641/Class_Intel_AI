import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Star, Target, Zap, Award, Gift, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  points: number;
  unlocked: boolean;
  unlockedAt?: string;
  category: string;
}

interface StudentStats {
  level: number;
  points: number;
  nextLevelPoints: number;
  streak: number;
  totalFeedback: number;
  weeklyGoal: number;
  weeklyProgress: number;
  achievements: Achievement[];
  leaderboard?: {
    rank: number;
    totalStudents: number;
  };
}

export function StudentGamification() {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const { data: stats, isLoading } = useQuery<StudentStats>({
    queryKey: ["/api/student/gamification"],
    refetchInterval: 30000,
  });

  const claimRewardMutation = useMutation({
    mutationFn: async (achievementId: string) => {
      const res = await apiRequest("POST", `/api/student/achievements/${achievementId}/claim`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/student/gamification"] });
      toast({
        title: "Reward claimed!",
        description: "You've earned bonus points!",
      });
    },
  });

  const categories = ["all", "feedback", "engagement", "quality", "social"];
  
  const filteredAchievements = stats?.achievements.filter(achievement => 
    selectedCategory === "all" || achievement.category === selectedCategory
  ) || [];

  const progressPercentage = stats ? 
    ((stats.points % stats.nextLevelPoints) / stats.nextLevelPoints) * 100 : 0;

  const weeklyProgressPercentage = stats ? 
    (stats.weeklyProgress / stats.weeklyGoal) * 100 : 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Level & Progress */}
      <Card className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-purple-600" />
            Your Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold">Level {stats?.level || 1}</h3>
              <p className="text-sm text-muted-foreground">
                {stats?.points || 0} / {stats?.nextLevelPoints || 100} XP
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-orange-600">
                <Zap className="h-4 w-4" />
                <span className="font-semibold">{stats?.streak || 0} day streak</span>
              </div>
            </div>
          </div>
          <Progress value={progressPercentage} className="h-2" />
          
          {stats?.leaderboard && (
            <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-yellow-600" />
                <span className="text-sm font-medium">Leaderboard Rank</span>
              </div>
              <Badge variant="secondary">
                #{stats.leaderboard.rank} of {stats.leaderboard.totalStudents}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly Goal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-green-600" />
            Weekly Goal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Feedback Progress</span>
            <span className="text-sm text-muted-foreground">
              {stats?.weeklyProgress || 0} / {stats?.weeklyGoal || 5}
            </span>
          </div>
          <Progress value={weeklyProgressPercentage} className="h-2" />
          {weeklyProgressPercentage >= 100 && (
            <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
              <Star className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-800">Goal completed! Keep it up!</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Achievements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-yellow-600" />
            Achievements
          </CardTitle>
          <div className="flex gap-2">
            {categories.map(category => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className="capitalize"
              >
                {category}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredAchievements.map((achievement) => (
              <div
                key={achievement.id}
                className={`p-4 rounded-lg border transition-all ${
                  achievement.unlocked
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-muted/30 border-muted'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-full ${
                    achievement.unlocked ? 'bg-yellow-100' : 'bg-muted'
                  }`}>
                    {achievement.unlocked ? (
                      <Trophy className="h-5 w-5 text-yellow-600" />
                    ) : (
                      <Lock className="h-5 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">{achievement.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {achievement.description}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <Badge variant="secondary" className="text-xs">
                        +{achievement.points} XP
                      </Badge>
                      {achievement.unlocked && !achievement.unlockedAt && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => claimRewardMutation.mutate(achievement.id)}
                          disabled={claimRewardMutation.isPending}
                        >
                          <Gift className="h-3 w-3 mr-1" />
                          Claim
                        </Button>
                      )}
                    </div>
                    {achievement.unlockedAt && (
                      <p className="text-xs text-green-600 mt-1">
                        Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {filteredAchievements.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Lock className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No achievements in this category yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
