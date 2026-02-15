import { useMemo } from "react";
import { TeacherCard } from "@/components/TeacherCard";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Teacher } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

type TeacherWithId = Teacher & { id: string };

export default function Favorites() {
  const { data: teachers = [], isLoading, error } = useQuery<Teacher[]>({
    queryKey: ["/api/teachers"],
  });

  const { data: favoriteTeacherIds = [] } = useQuery<string[]>({
    queryKey: ["/api/favorites/my"],
  });

  const addFavoriteMutation = useMutation({
    mutationFn: async (teacherId: string) => {
      const res = await apiRequest("POST", `/api/favorites/${teacherId}`);
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return res.json();
      }
      const text = await res.text();
      throw new Error(text && !text.startsWith("<") ? text : "Favorites API did not return valid JSON");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/favorites/my"] });
    },
  });

  const removeFavoriteMutation = useMutation({
    mutationFn: async (teacherId: string) => {
      const res = await apiRequest("DELETE", `/api/favorites/${teacherId}`);
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return res.json();
      }
      const text = await res.text();
      throw new Error(text && !text.startsWith("<") ? text : "Favorites API did not return valid JSON");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/favorites/my"] });
    },
  });

  const normalizedTeachers = useMemo<TeacherWithId[]>(
    () =>
      teachers.map((t) => ({
        ...(t as Teacher),
        id: (t as any).id ?? (t as any)._id ?? "",
      })),
    [teachers]
  );

  const favoriteTeachers = useMemo(
    () => normalizedTeachers.filter((t) => favoriteTeacherIds.includes(t.id)),
    [normalizedTeachers, favoriteTeacherIds]
  );

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="container px-4 md:px-6 py-8">
          <div className="mb-8">
            <Skeleton className="h-9 w-64 mb-2" />
            <Skeleton className="h-5 w-48" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="container px-4 md:px-6 py-8">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-2">Failed to load favourites</h2>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error ? error.message : "Unable to fetch favourites. Please try again later."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="container px-4 md:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Favourite Teachers</h1>
          <p className="text-muted-foreground mt-1">
            Quick access to the teachers you care about most
          </p>
        </div>

        {favoriteTeachers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              You haven't added any favourite teachers yet. Use the heart icon on the teachers list to favourite someone.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {favoriteTeachers.map((teacher) => (
              <TeacherCard
                key={teacher.id}
                teacher={{
                  id: teacher.id,
                  name: teacher.name,
                  department: teacher.department,
                  subject: teacher.subject,
                  averageRating: teacher.averageRating || 0,
                  totalFeedback: teacher.totalFeedback || 0,
                  officeHours: teacher.officeHours || "",
                }}
                hasGivenFeedback={false}
                isFavorite={true}
                onToggleFavorite={() => removeFavoriteMutation.mutate(teacher.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
