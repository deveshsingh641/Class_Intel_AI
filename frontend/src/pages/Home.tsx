import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  MessageSquare,
  BarChart3,
  Users,
  ArrowRight,
  Shield,
  Sparkles,
  Zap,
  TrendingUp,
  Mic,
  Bell,
  Target,
} from "lucide-react";
import { Leaderboard } from "@/components/Leaderboard";
import { ActivityFeed } from "@/components/ActivityFeed";

export default function Home() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero Section */}
      <section className="py-16 md:py-24 lg:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-green-500/5 to-teal-500/5" />
        <div className="container px-4 md:px-6 relative">
          <div className="flex flex-col items-center text-center space-y-8">
            <div className="glass-card rounded-3xl px-6 py-10 md:px-10 md:py-14 max-w-4xl w-full border border-emerald-500/20">
              <div className="flex flex-col items-center text-center space-y-8">
                <Badge variant="outline" className="gap-1.5 px-4 py-1.5 text-sm border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  Powered by AI
                </Badge>
                <div className="rounded-full bg-gradient-to-br from-emerald-500 to-green-600 p-5 shadow-lg shadow-emerald-500/25 dark:shadow-emerald-500/40">
                  <Brain className="h-14 w-14 text-white" />
                </div>
                <div className="space-y-4 max-w-3xl">
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                    <span className="bg-gradient-to-r from-emerald-400 via-green-400 to-teal-400 bg-clip-text text-transparent">
                      ClassIntel AI
                    </span>
                  </h1>
                  <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
                    AI-Powered Classroom Intelligence &amp; Performance Analytics System
                  </p>
                  <p className="text-base text-muted-foreground/80 max-w-xl mx-auto">
                    Sentiment analysis, risk prediction, smart suggestions, and real-time
                    insights — all driven by machine learning.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href="/signup">
                    <Button
                      size="lg"
                      className="gap-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 shadow-lg shadow-emerald-500/25 dark:shadow-emerald-500/40"
                      data-testid="button-get-started"
                    >
                      Get Started <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/login">
                    <Button
                      size="lg"
                      variant="outline"
                      className="glass border-emerald-500/30"
                      data-testid="button-sign-in"
                    >
                      Sign In
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI Features Section */}
      <section className="py-16">
        <div className="container px-4 md:px-6">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4 gap-1.5">
              <Zap className="h-3 w-3" />
              Core AI Capabilities
            </Badge>
            <h2 className="text-3xl font-bold mb-4">
              Why{" "}
              <span className="bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-transparent">
                ClassIntel AI
              </span>
              ?
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Next-gen intelligence layer that transforms raw feedback into actionable insights
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="glass-card hover-elevate group border-emerald-500/10 hover:border-emerald-500/30 transition-colors">
              <CardContent className="pt-6 text-center">
                <div className="rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 p-3 w-fit mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <BarChart3 className="h-6 w-6 text-emerald-500" />
                </div>
                <h3 className="font-semibold mb-2">Sentiment Analysis</h3>
                <p className="text-sm text-muted-foreground">
                  NLP-powered sentiment detection with domain-tuned education lexicons
                </p>
              </CardContent>
            </Card>
            <Card className="glass-card hover-elevate group border-green-500/10 hover:border-green-500/30 transition-colors">
              <CardContent className="pt-6 text-center">
                <div className="rounded-full bg-gradient-to-br from-green-500/20 to-green-600/10 p-3 w-fit mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Shield className="h-6 w-6 text-green-500" />
                </div>
                <h3 className="font-semibold mb-2">Risk Prediction</h3>
                <p className="text-sm text-muted-foreground">
                  ML-based student risk scoring using attendance, marks, sentiment & engagement
                </p>
              </CardContent>
            </Card>
            <Card className="glass-card hover-elevate group border-teal-500/10 hover:border-teal-500/30 transition-colors">
              <CardContent className="pt-6 text-center">
                <div className="rounded-full bg-gradient-to-br from-teal-500/20 to-teal-600/10 p-3 w-fit mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Target className="h-6 w-6 text-teal-500" />
                </div>
                <h3 className="font-semibold mb-2">Topic Extraction</h3>
                <p className="text-sm text-muted-foreground">
                  Intelligent topic clustering to identify weak areas & improvement zones
                </p>
              </CardContent>
            </Card>
            <Card className="glass-card hover-elevate group border-cyan-500/10 hover:border-cyan-500/30 transition-colors">
              <CardContent className="pt-6 text-center">
                <div className="rounded-full bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 p-3 w-fit mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Sparkles className="h-6 w-6 text-cyan-500" />
                </div>
                <h3 className="font-semibold mb-2">Smart Suggestions</h3>
                <p className="text-sm text-muted-foreground">
                  AI-generated actionable improvement recommendations for educators
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Secondary Features */}
      <section className="py-16">
        <div className="container px-4 md:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="glass-card hover-elevate">
              <CardContent className="pt-6 flex items-start gap-4">
                <div className="rounded-lg bg-emerald-500/10 p-2.5 shrink-0">
                  <Mic className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Voice Feedback</h3>
                  <p className="text-sm text-muted-foreground">
                    Browser-native speech-to-text for hands-free feedback submission
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card hover-elevate">
              <CardContent className="pt-6 flex items-start gap-4">
                <div className="rounded-lg bg-rose-500/10 p-2.5 shrink-0">
                  <Bell className="h-5 w-5 text-rose-500" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Real-Time Alerts</h3>
                  <p className="text-sm text-muted-foreground">
                    Instant notifications for negative spikes, risk alerts, and anomalies
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card hover-elevate">
              <CardContent className="pt-6 flex items-start gap-4">
                <div className="rounded-lg bg-teal-500/10 p-2.5 shrink-0">
                  <TrendingUp className="h-5 w-5 text-teal-500" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Performance Trends</h3>
                  <p className="text-sm text-muted-foreground">
                    Historical sentiment tracking and trend analysis over time
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16">
        <div className="container px-4 md:px-6">
          <div className="glass-card rounded-2xl p-8 border border-emerald-500/10 neon-border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              <div>
                <p className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-transparent">
                  9+
                </p>
                <p className="text-muted-foreground mt-1">Expert Teachers</p>
              </div>
              <div>
                <p className="text-4xl font-bold bg-gradient-to-r from-green-400 to-teal-400 bg-clip-text text-transparent">
                  300+
                </p>
                <p className="text-muted-foreground mt-1">Feedback Analyzed</p>
              </div>
              <div>
                <p className="text-4xl font-bold bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
                  5
                </p>
                <p className="text-muted-foreground mt-1">AI Models Active</p>
              </div>
              <div>
                <p className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                  24/7
                </p>
                <p className="text-muted-foreground mt-1">Real-Time Analysis</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Activity & Leaderboard Section */}
      <section className="py-16">
        <div className="container px-4 md:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Live Activity & Top Performers</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Real-time insights into platform activity and teaching excellence
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <ActivityFeed limit={6} />
            </div>
            <div className="lg:col-span-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Leaderboard type="top-rated" limit={5} />
                <Leaderboard type="most-feedback" limit={5} />
                <Leaderboard type="most-improved" limit={5} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture Section */}
      <section className="py-16">
        <div className="container px-4 md:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Three-layer architecture for intelligent classroom analytics
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="glass-card text-center">
              <CardContent className="pt-6 space-y-3">
                <div className="rounded-full bg-emerald-500/10 p-3 w-fit mx-auto">
                  <MessageSquare className="h-6 w-6 text-emerald-500" />
                </div>
                <h3 className="font-semibold">1. Collect</h3>
                <p className="text-sm text-muted-foreground">
                  Students submit feedback via text, voice, or QR code. Data flows into the
                  analysis pipeline.
                </p>
              </CardContent>
            </Card>
            <Card className="glass-card text-center">
              <CardContent className="pt-6 space-y-3">
                <div className="rounded-full bg-green-500/10 p-3 w-fit mx-auto">
                  <Brain className="h-6 w-6 text-green-500" />
                </div>
                <h3 className="font-semibold">2. Analyze</h3>
                <p className="text-sm text-muted-foreground">
                  Python AI engine runs sentiment analysis, topic extraction, and risk
                  prediction on every piece of feedback.
                </p>
              </CardContent>
            </Card>
            <Card className="glass-card text-center">
              <CardContent className="pt-6 space-y-3">
                <div className="rounded-full bg-teal-500/10 p-3 w-fit mx-auto">
                  <TrendingUp className="h-6 w-6 text-teal-500" />
                </div>
                <h3 className="font-semibold">3. Insight</h3>
                <p className="text-sm text-muted-foreground">
                  Teachers see actionable dashboards with charts, risk tables, AI
                  suggestions & real-time alerts.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16">
        <div className="container px-4 md:px-6">
          <div className="glass-card rounded-3xl p-10 text-center max-w-2xl mx-auto border border-emerald-500/20 neon-border">
            <div className="rounded-full bg-gradient-to-br from-emerald-500 to-green-600 p-4 w-fit mx-auto mb-6 shadow-lg shadow-emerald-500/30 dark:shadow-emerald-500/40">
              <Brain className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-muted-foreground mb-8">
              Join ClassIntel AI and unlock the power of intelligent classroom analytics
            </p>
            <Link href="/signup">
              <Button
                size="lg"
                className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 shadow-lg shadow-emerald-500/25"
                data-testid="button-join-now"
              >
                Join Now
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-emerald-500" />
              <span className="font-bold bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-transparent">
                ClassIntel AI
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              AI-Powered Classroom Intelligence & Performance Analytics
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
