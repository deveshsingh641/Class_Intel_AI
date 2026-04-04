import { useState, useMemo, useEffect } from "react";
import { SearchFilter } from "@/components/SearchFilter";
import { AddTeacherModal } from "@/components/AddTeacherModal";
import { StarRating } from "@/components/StarRating";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, MessageSquare, Star, Trash2, Plus, GraduationCap } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Teacher } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminTeachers() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("name-asc");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null);

  const teachersQuery = useQuery<Teacher[]>({
    queryKey: ["/api/teachers"],
  });
  const teachers: Teacher[] = Array.isArray(teachersQuery.data) ? teachersQuery.data : [];
  const isLoading = teachersQuery.isLoading;
  const error = teachersQuery.error;

  useEffect(() => {
    if (error) {
      console.error("Failed to fetch teachers:", error);
      toast({
        title: "Failed to load teachers",
        description:
          error instanceof Error
            ? error.message
            : "Unable to fetch teachers. Please try again later.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const addTeacherMutation = useMutation({
    mutationFn: async (data: { name: string; department: string; subject: string }) => {
      const res = await apiRequest("POST", "/api/teachers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
      setAddModalOpen(false);
      toast({
        title: "Teacher added",
        description: "New teacher has been added successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add teacher",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTeacherMutation = useMutation({
    mutationFn: async (teacherId: string) => {
      const res = await apiRequest("DELETE", `/api/teachers/${teacherId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
      setDeleteDialogOpen(false);
      setTeacherToDelete(null);
      toast({
        title: "Teacher removed",
        description: "Teacher has been removed from the system.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove teacher",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const departments = useMemo(
    () => Array.from(new Set(teachers.map((t) => t.department))),
    [teachers]
  );

  const filteredTeachers = useMemo(() => {
    let result = [...teachers];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.subject.toLowerCase().includes(query)
      );
    }

    if (selectedDepartment && selectedDepartment !== "all") {
      result = result.filter((t) => t.department === selectedDepartment);
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "rating-high":
          return (b.averageRating || 0) - (a.averageRating || 0);
        case "rating-low":
          return (a.averageRating || 0) - (b.averageRating || 0);
        case "feedback-most":
          return (b.totalFeedback || 0) - (a.totalFeedback || 0);
        default:
          return 0;
      }
    });

    return result;
  }, [teachers, searchQuery, sortBy, selectedDepartment]);

  const handleAddTeacher = (data: { name: string; department: string; subject: string }) => {
    addTeacherMutation.mutate(data);
  };

  const handleDeleteClick = (teacher: Teacher) => {
    setTeacherToDelete(teacher);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (teacherToDelete) {
      deleteTeacherMutation.mutate(teacherToDelete.id);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="container px-4 md:px-6 py-8">
          <div className="mb-8">
            <Skeleton className="h-9 w-48 mb-2" />
            <Skeleton className="h-5 w-64" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="container px-4 md:px-6 py-8">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-2">Failed to load teachers</h2>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error
                ? error.message
                : "Unable to fetch teachers. Please check your connection and try again."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="container px-4 md:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">Manage Teachers</h1>
            <p className="text-muted-foreground mt-1">
              Add, update, and remove teachers from the system
            </p>
          </div>
          <Button onClick={() => setAddModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Teacher
          </Button>
        </div>

        <div className="mb-6">
          <SearchFilter
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            onSortChange={setSortBy}
            departments={departments}
            selectedDepartment={selectedDepartment}
            onDepartmentChange={setSelectedDepartment}
            placeholder="Search teachers by name or subject..."
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">Teachers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead className="text-center">Feedback</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTeachers.map((teacher) => (
                    <TableRow key={teacher.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="bg-primary/10 text-primary text-sm">
                              {(teacher.name ?? "")
                                .trim()
                                .split(/\s+/)
                                .filter(Boolean)
                                .map((n) => n[0])
                                .join("") || "T"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{teacher.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{teacher.subject}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{teacher.department}</Badge>
                      </TableCell>
                      <TableCell>
                        <StarRating rating={teacher.averageRating || 0} size="sm" showValue />
                      </TableCell>
                      <TableCell className="text-center">
                        {teacher.totalFeedback || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(teacher)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {filteredTeachers.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No teachers found matching your criteria.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <AddTeacherModal
          open={addModalOpen}
          onOpenChange={setAddModalOpen}
          onSubmit={handleAddTeacher}
          isSubmitting={addTeacherMutation.isPending}
        />

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Teacher</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove {teacherToDelete?.name} from the
                system? This action cannot be undone and will also delete all
                associated feedback.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteTeacherMutation.isPending}
              >
                {deleteTeacherMutation.isPending ? "Removing..." : "Remove"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
