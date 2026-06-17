import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { Navbar } from "@/components/Navbar";
import { DatabaseStatusAlert } from "@/components/DatabaseStatusAlert";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import StudentHub from "@/pages/StudentHub";
import StudentTeachers from "@/pages/StudentTeachers";
import MyFeedback from "@/pages/MyFeedback";
import TeacherDashboard from "@/pages/TeacherDashboard";
import TeacherProfile from "@/pages/TeacherProfile";
import EditTeacherProfile from "@/pages/EditTeacherProfile";
import Analytics from "@/pages/Analytics";
import AdminPanel from "@/pages/AdminPanel";
import AdminTeachers from "@/pages/AdminTeachers";
import QrFeedbackPage from "@/pages/QrFeedbackPage";
import IntelligenceDashboard from "@/pages/IntelligenceDashboard";
import AttendancePage from "@/pages/AttendancePage";
import LectureSummarizer from "@/pages/LectureSummarizer";
import QuizPage from "@/pages/QuizPage";
import PerformanceDashboard from "@/pages/PerformanceDashboard";
import RAGChatbot from "@/pages/RAGChatbot";

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
      
      {/* Student Routes */}
      <Route path="/student">
        <ProtectedRoute allowedRoles={["student"]}>
          <StudentHub />
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

      {/* Teacher Routes */}
      <Route path="/teacher/intelligence">
        <ProtectedRoute allowedRoles={["teacher", "admin"]}>
          <IntelligenceDashboard />
        </ProtectedRoute>
      </Route>

      <Route path="/teacher/:id/edit">
        <ProtectedRoute allowedRoles={["teacher", "admin"]}>
          <EditTeacherProfile />
        </ProtectedRoute>
      </Route>
      
      <Route path="/teacher/:id">
        <ProtectedRoute>
          <TeacherProfile />
        </ProtectedRoute>
      </Route>
      
      <Route path="/teacher">
        <ProtectedRoute allowedRoles={["teacher"]}>
          <TeacherDashboard />
        </ProtectedRoute>
      </Route>

      {/* Shared Module Routes */}
      <Route path="/attendance">
        <ProtectedRoute>
          <AttendancePage />
        </ProtectedRoute>
      </Route>

      <Route path="/lectures">
        <ProtectedRoute>
          <LectureSummarizer />
        </ProtectedRoute>
      </Route>

      <Route path="/quizzes">
        <ProtectedRoute>
          <QuizPage />
        </ProtectedRoute>
      </Route>

      <Route path="/performance">
        <ProtectedRoute>
          <PerformanceDashboard />
        </ProtectedRoute>
      </Route>

      <Route path="/study-assistant">
        <ProtectedRoute>
          <RAGChatbot />
        </ProtectedRoute>
      </Route>

      {/* Admin Routes */}
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



      <Route path="/analytics/:id">
        <ProtectedRoute allowedRoles={["teacher", "admin"]}>
          <Analytics />
        </ProtectedRoute>
      </Route>

      {/* Public Routes */}
      <Route path="/qr-feedback/:teacherId">
        <QrFeedbackPage />
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
              <ErrorBoundary>
                <Router />
              </ErrorBoundary>
              <DatabaseStatusAlert />
            </div>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
