import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Award, Star, Users, MessageSquare, TrendingUp, Zap } from "lucide-react";
import type { ReactNode } from "react";

export interface BadgeType {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  color: string;
  unlocked: boolean;
}

export interface SkillBadgesProps {
  averageRating: number;
  totalFeedback: number;
  totalStudents: number;
  className?: string;
}

export function SkillBadges({
  averageRating,
  totalFeedback,
  totalStudents,
  className = "",
}: SkillBadgesProps) {
  const badges: BadgeType[] = [
    {
      id: "excellent",
      name: "Excellent Educator",
      description: "Maintained 4.5+ average rating",
      icon: <Star className="h-5 w-5" />,
      color: "from-yellow-400 to-yellow-600",
      unlocked: averageRating >= 4.5,
    },
    {
      id: "highly-rated",
      name: "Highly Rated",
      description: "Achieved 4.0+ average rating",
      icon: <Award className="h-5 w-5" />,
      color: "from-emerald-400 to-emerald-500",
      unlocked: averageRating >= 4.0,
    },
    {
      id: "popular",
      name: "Popular",
      description: "Received 10+ feedback submissions",
      icon: <Users className="h-5 w-5" />,
      color: "from-blue-400 to-blue-600",
      unlocked: totalFeedback >= 10,
    },
    {
      id: "prolific",
      name: "Prolific Educator",
      description: "Received 20+ feedback submissions",
      icon: <MessageSquare className="h-5 w-5" />,
      color: "from-green-400 to-green-600",
      unlocked: totalFeedback >= 20,
    },
    {
      id: "widely-appreciated",
      name: "Widely Appreciated",
      description: "Taught 15+ unique students",
      icon: <TrendingUp className="h-5 w-5" />,
      color: "from-pink-400 to-pink-600",
      unlocked: totalStudents >= 15,
    },
    {
      id: "champion",
      name: "Champion Educator",
      description: "4.5+ rating with 20+ feedbacks",
      icon: <Zap className="h-5 w-5" />,
      color: "from-orange-400 to-orange-600",
      unlocked: averageRating >= 4.5 && totalFeedback >= 20,
    },
  ];

  const unlockedBadges = badges.filter(b => b.unlocked);
  const lockedBadges = badges.filter(b => !b.unlocked);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Unlocked Badges */}
      {unlockedBadges.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Award className="h-4 w-4" />
            Achievements
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {unlockedBadges.map(badge => (
              <Tooltip key={badge.id}>
                <TooltipTrigger asChild>
                  <div
                    className={`
                      relative p-3 rounded-lg bg-gradient-to-br ${badge.color}
                      text-white font-semibold text-center cursor-pointer
                      transform hover:scale-110 transition-all duration-300
                      shadow-lg hover:shadow-xl
                      animate-scaleIn
                    `}
                    style={{ animation: `scaleIn 0.5s ease-out` }}
                  >
                    <div className="flex flex-col items-center gap-1">
                      {badge.icon}
                      <span className="text-xs font-bold line-clamp-2">
                        {badge.name}
                      </span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm font-medium">{badge.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {badge.description}
                  </p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      {/* Locked Badges Preview */}
      {lockedBadges.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground/60 flex items-center gap-2">
            <Award className="h-4 w-4" />
            Locked Achievements
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {lockedBadges.map(badge => (
              <Tooltip key={badge.id}>
                <TooltipTrigger asChild>
                  <div
                    className={`
                      relative p-3 rounded-lg bg-muted/50 text-muted-foreground
                      font-semibold text-center cursor-help
                      border border-dashed border-muted-foreground/30
                      hover:border-muted-foreground/60 transition-all duration-300
                    `}
                  >
                    <div className="flex flex-col items-center gap-1 opacity-50">
                      {badge.icon}
                      <span className="text-xs font-bold line-clamp-2">
                        {badge.name}
                      </span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm font-medium">{badge.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {badge.description}
                  </p>
                  <p className="text-xs mt-1 text-yellow-500">
                    Locked - Keep improving!
                  </p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
