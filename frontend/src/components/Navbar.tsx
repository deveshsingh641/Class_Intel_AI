import { Link, useLocation } from "wouter";
import { LogOut, Brain, User, Menu, GraduationCap, BookOpen, ClipboardCheck, FileText, BarChart3, Bot, Megaphone, ClipboardList, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationCenter } from "./NotificationCenter";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function Navbar() {
  const { user, logout, isAuthenticated } = useAuth();
  const [location] = useLocation();

  const roleColors = {
    student: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    teacher: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
    admin: "bg-green-500/15 text-green-600 dark:text-green-400",
  };

  const navLinks = isAuthenticated
    ? user?.role === "admin"
      ? [
          { href: "/admin", label: "Dashboard", icon: BarChart3 },
          { href: "/admin/teachers", label: "Teachers", icon: GraduationCap },
          { href: "/teacher/intelligence", label: "Insights", icon: BarChart3 },
          { href: "/announcements", label: "Announcements", icon: Megaphone },
          { href: "/assignments", label: "Assignments", icon: ClipboardList },
          { href: "/quizzes", label: "Quizzes", icon: FileText },
          { href: "/lectures", label: "Lectures", icon: BookOpen },
        ]
      : user?.role === "teacher"
      ? [
          { href: "/teacher", label: "Dashboard", icon: BarChart3 },
          { href: "/teacher/intelligence", label: "Insights", icon: BarChart3 },
          { href: "/announcements", label: "Announcements", icon: Megaphone },
          { href: "/assignments", label: "Assignments", icon: ClipboardList },
          { href: "/quizzes", label: "Quizzes", icon: FileText },
          { href: "/lectures", label: "Lectures", icon: BookOpen },
          { href: "/attendance", label: "Attendance", icon: ClipboardCheck },
          { href: "/study-assistant", label: "Course Notes", icon: BookOpen },
        ]
      : [
          { href: "/student", label: "My Hub", icon: GraduationCap },
          { href: "/announcements", label: "Announcements", icon: Megaphone },
          { href: "/assignments", label: "Assignments", icon: ClipboardList },
          { href: "/achievements", label: "Achievements", icon: Trophy },
          { href: "/attendance", label: "Attendance", icon: ClipboardCheck },
          { href: "/quizzes", label: "Quizzes", icon: FileText },
          { href: "/lectures", label: "Lectures", icon: BookOpen },
          { href: "/performance", label: "Performance", icon: BarChart3 },
          { href: "/study-assistant", label: "Course Notes", icon: BookOpen },
        ]
    : [];

  return (
    <header className="sticky top-0 z-50 w-full glass border-b border-border/60 shadow-sm shadow-black/5">
      <div className="container flex h-16 items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg hidden sm:inline-block bg-gradient-to-r from-emerald-400 via-green-400 to-teal-400 bg-clip-text text-transparent">ClassIntel</span>
        </Link>

        {isAuthenticated && (
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link key={link.href} href={link.href}>
                  <Button
                    variant={location === link.href ? "secondary" : "ghost"}
                    size="sm"
                    className={
                      location === link.href
                        ? "glass border border-border/60"
                        : ""
                    }
                    data-testid={`nav-${link.label.toLowerCase().replace(" ", "-")}`}
                  >
                    <Icon className="h-4 w-4 mr-1.5" />
                    {link.label}
                  </Button>
                </Link>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-2">
          <ThemeToggle />

          {isAuthenticated && user && (
            <NotificationCenter />
          )}

          {isAuthenticated && user ? (
            <>
              <Badge
                variant="secondary"
                className={`hidden sm:flex ${roleColors[user.role]}`}
              >
                {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
              </Badge>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full" data-testid="button-user-menu">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {(user.name ?? "U")
                          .trim()
                          .split(/\s+/)
                          .filter(Boolean)
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 glass-card">
                  <div className="px-2 py-1.5">
                    <p className="font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem data-testid="menu-profile">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive" data-testid="menu-logout">
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Sheet>
                <SheetTrigger asChild className="md:hidden">
                  <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-72 glass-card border border-border/60">
                  <nav className="flex flex-col gap-2 mt-6">
                    {navLinks.map((link) => {
                      const Icon = link.icon;
                      return (
                        <Link key={link.href} href={link.href}>
                          <Button
                            variant={location === link.href ? "secondary" : "ghost"}
                            className="w-full justify-start"
                          >
                            <Icon className="h-4 w-4 mr-2" />
                            {link.label}
                          </Button>
                        </Link>
                      );
                    })}
                  </nav>
                </SheetContent>
              </Sheet>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm" data-testid="button-login">
                  Login
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm" data-testid="button-signup">
                  Sign Up
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
