import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { withApiBase } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Trophy, Star, Zap, BookOpen, MessageSquare, Users, Check, Lock } from "lucide-react";
import { Confetti } from "@/components/Confetti";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

function getHeaders() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

const rarityConfig = {
  common:    { label: "Common",    color: "from-slate-400 to-slate-500",   glow: "shadow-slate-500/20" },
  uncommon:  { label: "Uncommon",  color: "from-emerald-400 to-green-500",  glow: "shadow-emerald-500/30" },
  rare:      { label: "Rare",      color: "from-blue-400 to-indigo-500",    glow: "shadow-blue-500/30" },
  legendary: { label: "Legendary", color: "from-amber-400 to-orange-500",   glow: "shadow-amber-500/40" },
};

const categoryIcons: Record<string, React.ElementType> = {
  academic: BookOpen,
  attendance: Star,
  social: MessageSquare,
  engagement: Users,
};

function AchievementCard({ achievement }: { achievement: any }) {
  const rarity = rarityConfig[achievement.rarity as keyof typeof rarityConfig] || rarityConfig.common;
  const CategoryIcon = categoryIcons[achievement.category] || Star;

  return (
    <div className={`relative group rounded-2xl p-[1px] transition-all duration-300 ${achievement.unlocked ? `bg-gradient-to-br ${rarity.color} shadow-lg ${rarity.glow}` : "bg-border"}`}>
      <div className={`rounded-2xl p-5 h-full flex flex-col items-center text-center gap-3 ${achievement.unlocked ? "bg-card" : "bg-card/80"}`}>
        {!achievement.unlocked && (
          <div className="absolute inset-0 rounded-2xl bg-background/60 backdrop-blur-[2px] flex items-center justify-center z-10">
            <Lock className="h-6 w-6 text-muted-foreground/40" />
          </div>
        )}
        {/* Icon */}
        <div className={`text-4xl transition-transform group-hover:scale-110 duration-200 ${!achievement.unlocked ? "grayscale opacity-40" : ""}`}>
          {achievement.icon}
        </div>
        {/* Rarity badge */}
        <Badge variant="outline" className={`text-[10px] ${achievement.unlocked ? `bg-gradient-to-r ${rarity.color} bg-clip-text text-transparent border-0` : "text-muted-foreground"}`}>
          {rarity.label}
        </Badge>
        <div>
          <p className={`font-semibold text-sm mb-0.5 ${!achievement.unlocked ? "text-muted-foreground" : ""}`}>{achievement.title}</p>
          <p className="text-[11px] text-muted-foreground leading-tight">{achievement.description}</p>
        </div>
        {achievement.unlocked && achievement.unlockedAt && (
          <p className="text-[10px] text-muted-foreground/60">
            Unlocked {formatDistanceToNow(new Date(achievement.unlockedAt), { addSuffix: true })}
          </p>
        )}
        {achievement.unlocked && (
          <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center">
            <Check className="h-3 w-3 text-white" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function AchievementsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showConfetti, setShowConfetti] = useState(false);

  const { data: achievements = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/achievements/my"],
    queryFn: async () => {
      const res = await fetch(withApiBase("/api/achievements/my"), { headers: getHeaders() });
      if (!res.ok) throw new Error("Failed to load achievements");
      return res.json();
    },
  });

  const evaluateMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(withApiBase("/api/achievements/evaluate"), {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Evaluation failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/achievements/my"] });
      if (data.newlyUnlocked?.length > 0) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);
        toast({
          title: `🎉 ${data.newlyUnlocked.length} new badge${data.newlyUnlocked.length > 1 ? "s" : ""} unlocked!`,
          description: data.newlyUnlocked.map((a: any) => `${a.icon} ${a.title}`).join(", "),
        });
      } else {
        toast({ title: "All caught up!", description: "No new badges this time. Keep engaging!" });
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Auto-evaluate on mount for students
  useEffect(() => {
    if (user?.role === "student") evaluateMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  const unlocked = achievements.filter((a: any) => a.unlocked);
  const total = achievements.length;
  const progress = total > 0 ? Math.round((unlocked.length / total) * 100) : 0;

  const categories = ["all", "academic", "attendance", "social", "engagement"];
  const [activeCategory, setActiveCategory] = useState("all");
  const filtered = activeCategory === "all" ? achievements : achievements.filter((a: any) => a.category === activeCategory);

  return (
    <div className="container max-w-5xl mx-auto px-4 py-8 space-y-8">
      {showConfetti && <Confetti active={showConfetti} onComplete={() => setShowConfetti(false)} />}

      {/* Header */}
      <div className="glass-card rounded-3xl p-6 border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
              <Trophy className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Achievements</h1>
              <p className="text-sm text-muted-foreground">
                {unlocked.length} of {total} badges unlocked
              </p>
              <div className="flex items-center gap-3 mt-2">
                <Progress value={progress} className="w-40 h-2" />
                <span className="text-sm font-medium text-amber-500">{progress}%</span>
              </div>
            </div>
          </div>
          {user?.role === "student" && (
            <Button variant="outline" className="gap-2 border-amber-500/30 hover:bg-amber-500/10" onClick={() => evaluateMut.mutate()} disabled={evaluateMut.isPending}>
              <Zap className="h-4 w-4 text-amber-500" />
              {evaluateMut.isPending ? "Checking..." : "Check Progress"}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Earned", value: unlocked.length, icon: "🏆", color: "from-amber-500 to-orange-400" },
          { label: "Remaining", value: total - unlocked.length, icon: "🔒", color: "from-slate-500 to-slate-400" },
          { label: "Completion", value: `${progress}%`, icon: "📊", color: "from-emerald-500 to-green-400" },
          { label: "Rarest", value: unlocked.filter((a: any) => a.rarity === "legendary").length > 0 ? "Legendary" : "Rare", icon: "💎", color: "from-purple-500 to-indigo-400" },
        ].map((stat) => (
          <Card key={stat.label} className="glass-card">
            <CardContent className="p-4 text-center">
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className={`text-2xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Category filters */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((c) => (
          <Button key={c} variant={activeCategory === c ? "default" : "outline"} size="sm"
            className={activeCategory === c ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0" : ""}
            onClick={() => setActiveCategory(c)}>
            {c === "all" ? "All" : c.charAt(0).toUpperCase() + c.slice(1)}
          </Button>
        ))}
      </div>

      {/* Badge Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {filtered.map((a: any) => <AchievementCard key={a.id} achievement={a} />)}
        </div>
      )}
    </div>
  );
}
