import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, MessageSquare, BarChart3, Users, ArrowRight, Star } from "lucide-react";
import { Leaderboard } from "@/components/Leaderboard";
import { ActivityFeed } from "@/components/ActivityFeed";

export default function Home() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero Section */}
      <section className="py-16 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center text-center space-y-8">
            <div className="glass-card rounded-3xl px-6 py-10 md:px-10 md:py-14 max-w-4xl w-full">
              <div className="flex flex-col items-center text-center space-y-8">
                <div className="rounded-full bg-primary/10 p-4">
                  <GraduationCap className="h-12 w-12 text-primary" />
                </div>
                <div className="space-y-4 max-w-3xl">
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                    Transform Education Through{" "}
                    <span className="text-primary">Feedback</span>
                  </h1>
                  <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                    A comprehensive platform for students to share feedback and teachers to track
                    their performance. Build a better learning environment together.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href="/signup">
                    <Button size="lg" className="gap-2" data-testid="button-get-started">
                      Get Started <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/login">
                    <Button size="lg" variant="outline" className="glass" data-testid="button-sign-in">
                      Sign In
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16">
        <div className="container px-4 md:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Why EduFeedback?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Designed to bridge the gap between students and educators
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="glass-card hover-elevate">
              <CardContent className="pt-6 text-center">
                <div className="rounded-full bg-primary/10 p-3 w-fit mx-auto mb-4">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Easy Feedback</h3>
                <p className="text-sm text-muted-foreground">
                  Simple rating system with optional comments for detailed feedback
                </p>
              </CardContent>
            </Card>
            <Card className="glass-card hover-elevate">
              <CardContent className="pt-6 text-center">
                <div className="rounded-full bg-primary/10 p-3 w-fit mx-auto mb-4">
                  <BarChart3 className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Analytics Dashboard</h3>
                <p className="text-sm text-muted-foreground">
                  Visual insights with rating distributions and trends
                </p>
              </CardContent>
            </Card>
            <Card className="glass-card hover-elevate">
              <CardContent className="pt-6 text-center">
                <div className="rounded-full bg-primary/10 p-3 w-fit mx-auto mb-4">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Role-Based Access</h3>
                <p className="text-sm text-muted-foreground">
                  Separate dashboards for students, teachers, and admins
                </p>
              </CardContent>
            </Card>
            <Card className="glass-card hover-elevate">
              <CardContent className="pt-6 text-center">
                <div className="rounded-full bg-primary/10 p-3 w-fit mx-auto mb-4">
                  <Star className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Fair Ratings</h3>
                <p className="text-sm text-muted-foreground">
                  One submission per student ensures authentic feedback
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16">
        <div className="container px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-4xl font-bold text-primary">9+</p>
              <p className="text-muted-foreground mt-1">Expert Teachers</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-primary">300+</p>
              <p className="text-muted-foreground mt-1">Feedback Collected</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-primary">4.5</p>
              <p className="text-muted-foreground mt-1">Average Rating</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-primary">100%</p>
              <p className="text-muted-foreground mt-1">Secure & Private</p>
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
              See what's happening right now and recognize excellence in teaching
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

      {/* CTA Section */}
      <section className="py-16">
        <div className="container px-4 md:px-6">
          <div className="glass-card rounded-3xl p-10 text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-muted-foreground mb-8">
              Join our platform today and be part of the educational transformation
            </p>
            <Link href="/signup">
              <Button size="lg" data-testid="button-join-now">
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
              <GraduationCap className="h-5 w-5 text-primary" />
              <span className="font-semibold">EduFeedback</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Building better education through feedback
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
