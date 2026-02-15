import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { Navbar } from "@/components/Navbar";
import { AIChatbot } from "@/components/AIChatbot";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import StudentDashboard from "@/pages/StudentDashboard";
import StudentTeachers from "@/pages/StudentTeachers";
import MyFeedback from "@/pages/MyFeedback";
import Favorites from "@/pages/Favorites";
import TeacherDashboard from "@/pages/TeacherDashboard";
import TeacherProfile from "@/pages/TeacherProfile";
import EditTeacherProfile from "@/pages/EditTeacherProfile";
import Analytics from "@/pages/Analytics";
import AdminPanel from "@/pages/AdminPanel";
import AdminTeachers from "@/pages/AdminTeachers";
import QrFeedbackPage from "@/pages/QrFeedbackPage";

function ProtectedRoute({ 
  children, 
  allowedRoles 
}: { 
  children: React.ReactNode; 
  allowedRoles?: string[];
}) {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

function Router() {
  const { isAuthenticated, user } = useAuth();

  return (
    <Switch>
      <Route path="/">
        {isAuthenticated ? (
          user?.role === "admin" ? (
            <Redirect to="/admin" />
          ) : user?.role === "teacher" ? (
            <Redirect to="/teacher" />
          ) : (
            <Redirect to="/student" />
          )
        ) : (
          <Home />
        )}
      </Route>
      
      <Route path="/login">
        {isAuthenticated ? <Redirect to="/" /> : <Login />}
      </Route>
      
      <Route path="/signup">
        {isAuthenticated ? <Redirect to="/" /> : <Signup />}
      </Route>
      
      <Route path="/student">
        <ProtectedRoute allowedRoles={["student"]}>
          <StudentDashboard />
        </ProtectedRoute>
      </Route>
      
      <Route path="/student/teachers">
        <ProtectedRoute allowedRoles={["student"]}>
          <StudentTeachers />
        </ProtectedRoute>
      </Route>

      <Route path="/student/feedback">
        <ProtectedRoute allowedRoles={["student"]}>
          <MyFeedback />
        </ProtectedRoute>
      </Route>

      <Route path="/favorites">
        <ProtectedRoute allowedRoles={["student"]}>
          <Favorites />
        </ProtectedRoute>
      </Route>
      
      <Route path="/teacher/:id/edit">
        <EditTeacherProfile />
      </Route>
      
      <Route path="/teacher/:id">
        <TeacherProfile />
      </Route>
      
      <Route path="/analytics/:id">
        <Analytics />
      </Route>
      
      <Route path="/teacher">
        <ProtectedRoute allowedRoles={["teacher"]}>
          <TeacherDashboard />
        </ProtectedRoute>
      </Route>
      
      <Route path="/teacher/feedback">
        <ProtectedRoute allowedRoles={["teacher"]}>
          <TeacherDashboard />
        </ProtectedRoute>
      </Route>

      <Route path="/qr-feedback/:teacherId">
        <QrFeedbackPage />
      </Route>
      
      <Route path="/admin">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminPanel />
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/teachers">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminTeachers />
        </ProtectedRoute>
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <div className="min-h-screen bg-transparent">
              <Navbar />
              <Router />
              <AIChatbot />
            </div>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
