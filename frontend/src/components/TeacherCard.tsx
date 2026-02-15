import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StarRating } from "./StarRating";
import { MessageSquare, BookOpen, ArrowRight, Heart, Clock } from "lucide-react";
import { useLocation } from "wouter";

export interface Teacher {
  id: string;
  name: string;
  department: string;
  subject: string;
  averageRating: number;
  totalFeedback: number;
  officeHours?: string;
}

interface TeacherCardProps {
  teacher: Teacher;
  onGiveFeedback?: (teacher: Teacher) => void;
  hasGivenFeedback?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

export function TeacherCard({ teacher, onGiveFeedback, hasGivenFeedback = false, isFavorite = false, onToggleFavorite }: TeacherCardProps) {
  const [, navigate] = useLocation();

  return (
    <Card className="hover-elevate transition-all duration-200 animate-slideInUp" data-testid={`card-teacher-${teacher.id}`}>
      <CardHeader className="flex flex-row items-start gap-4 pb-2">
        <Avatar className="h-12 w-12">
          <AvatarFallback className="bg-primary/10 text-primary font-medium">
            {(teacher.name ?? "T")
              .trim()
              .split(/\s+/)
              .filter(Boolean)
              .map((n) => n[0])
              .join("")
              .toUpperCase() || "T"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold leading-none" data-testid={`text-teacher-name-${teacher.id}`}>
                {teacher.name}
              </h3>
              <Badge variant="secondary" className="text-xs">
                {teacher.department}
              </Badge>
            </div>
            {onToggleFavorite && (
              <button
                type="button"
                onClick={onToggleFavorite}
                className="rounded-full p-1 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <Heart
                  className={`h-4 w-4 ${isFavorite ? "fill-primary text-primary" : ""}`}
                />
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4" />
          <span>{teacher.subject}</span>
        </div>
        {teacher.officeHours && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span className="truncate" title={teacher.officeHours}>
              {teacher.officeHours}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <StarRating rating={teacher.averageRating} size="sm" showValue />
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {teacher.totalFeedback} reviews
          </span>
        </div>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => onGiveFeedback?.(teacher)}
          disabled={hasGivenFeedback}
          data-testid={`button-feedback-${teacher.id}`}
        >
          {hasGivenFeedback ? "Feedback Submitted" : "Give Feedback"}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigate(`/teacher/${teacher.id}`)}
          className="hover:bg-accent transition-colors"
          title="View teacher profile"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
