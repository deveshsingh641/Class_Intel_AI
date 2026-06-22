import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { GitMerge, Pencil, Star, MessageSquare, Plus, Loader2 } from "lucide-react";

interface DepartmentStats {
  department: string;
  avgRating: number;
  totalFeedback: number;
}

export function DepartmentManagement() {
  const { toast } = useToast();
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: stats = [], isLoading, refetch } = useQuery<DepartmentStats[]>({
    queryKey: ["/api/analytics/departments/comparison"],
  });

  const renameMutation = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) => {
      const res = await apiRequest("POST", "/api/admin/departments/rename", { oldName, newName });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.message || "Department renamed successfully",
      });
      setIsDialogOpen(false);
      setEditingDept(null);
      setNewName("");
      refetch();
      // Invalidate related teacher/student queries
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to rename department",
        variant: "destructive",
      });
    },
  });

  const handleOpenRename = (dept: string) => {
    setEditingDept(dept);
    setNewName(dept);
    setIsDialogOpen(true);
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDept || !newName.trim()) return;
    renameMutation.mutate({ oldName: editingDept, newName: newName.trim() });
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Department Management</CardTitle>
          <CardDescription>
            View department statistics, rename departments, or merge departments by renaming one to an existing name.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : stats.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">No departments found in the system.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department Name</TableHead>
                <TableHead className="text-center">Total Feedback</TableHead>
                <TableHead className="text-center">Average Rating</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map((row) => (
                <TableRow key={row.department || "unassigned"}>
                  <TableCell className="font-medium">
                    {row.department || "Unassigned / General"}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground text-sm">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {row.totalFeedback}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center gap-1 text-sm font-semibold">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {row.avgRating ? row.avgRating.toFixed(1) : "0.0"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.department && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenRename(row.department)}
                        className="gap-1.5"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Rename / Merge
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleRenameSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <GitMerge className="h-5 w-5 text-emerald-500" />
                Rename / Merge Department
              </DialogTitle>
              <DialogDescription>
                Changing this will update all users (students/teachers) currently assigned to this department. 
                Renaming to an existing department name will effectively merge them.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="old-name" className="text-muted-foreground">Original Name</Label>
                <Input id="old-name" value={editingDept || ""} disabled />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-name">New Name</Label>
                <Input
                  id="new-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter new department name"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={renameMutation.isPending || !newName.trim() || newName.trim() === editingDept}>
                {renameMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
