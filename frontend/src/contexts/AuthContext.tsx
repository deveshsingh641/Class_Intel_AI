import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { withApiBase, getApiBaseUrl } from "@/lib/queryClient";

export type UserRole = "student" | "teacher" | "admin";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  department?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

interface SignupData {
  name: string;
  email: string;
  password: string;
  role: "student" | "teacher";
  department?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      // Log the API base URL at startup
      getApiBaseUrl();
      
      const token = localStorage.getItem("token");
      const storedUser = localStorage.getItem("user");

      if (!token || !storedUser) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      // Retry logic: when the dev server restarts after code changes, the
      // backend may not be ready yet.  We retry a few times before giving up
      // so a temporary network blip doesn't wipe credentials.
      const MAX_RETRIES = 3;
      const RETRY_DELAY = 1500; // ms

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const response = await fetch(withApiBase("/api/auth/me"), {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            credentials: "include",
          });

          if (response.ok) {
            // Token is valid — refresh user data
            const freshUser = await response.json();
            localStorage.setItem("user", JSON.stringify(freshUser));
            setUser(freshUser);
            setIsLoading(false);
            return;
          }

          // 401 / 403 means the token is genuinely rejected (expired, secret
          // changed, revoked).  Only in this case do we clear credentials.
          if (response.status === 401 || response.status === 403) {
            console.warn("Auth token rejected (status", response.status, ") — clearing session");
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            setUser(null);
            setIsLoading(false);
            return;
          }

          // Any other server error (500, 502, etc.) — the token might still be
          // fine but the server is having issues.  Fall through to retry / use
          // cached user.
          console.warn(`Auth check returned ${response.status}, attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
        } catch (networkError) {
          // Network error (server not reachable, e.g. still restarting after
          // code changes).  Do NOT clear credentials — retry instead.
          console.warn(`Auth check network error (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, networkError);
        }

        // Wait before retrying (skip wait on last attempt)
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY));
        }
      }

      // All retries exhausted but no definitive 401/403 received.
      // Keep the stored user so the session survives server restarts.
      console.warn("Server unreachable after retries — using cached session");
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        setUser(null);
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(withApiBase("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Login failed");
      }

      const data = await response.json();
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (data: SignupData) => {
    setIsLoading(true);
    try {
      const response = await fetch(withApiBase("/api/auth/signup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Signup failed");
      }

      const result = await response.json();
      localStorage.setItem("token", result.token);
      localStorage.setItem("user", JSON.stringify(result.user));
      setUser(result.user);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    const token = localStorage.getItem("token");
    if (token) {
      void fetch(withApiBase("/api/auth/logout"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      }).catch(() => {
        // Ignore network errors on logout; we still clear local state.
      });
    }
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        signup,
        logout,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
