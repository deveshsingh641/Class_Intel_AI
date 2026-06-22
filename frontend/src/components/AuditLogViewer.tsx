import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Search, Shield, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  target?: string;
  targetId?: string;
  detail?: string;
  ip?: string;
  createdAt: string;
}

interface AuditLogsResponse {
  items: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

export function AuditLogViewer() {
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, refetch } = useQuery<AuditLogsResponse>({
    queryKey: ["/api/admin/audit-logs", page, limit, searchTerm, roleFilter, actionFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      if (roleFilter !== "all") params.set("role", roleFilter);
      if (actionFilter !== "all") params.set("action", actionFilter);
      const res = await apiRequest("GET", `/api/admin/audit-logs?${params.toString()}`);
      return res.json();
    },
    refetchInterval: 15000,
  });

  const logs = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-red-500 hover:bg-red-600 text-white border-none">Admin</Badge>;
      case "teacher":
        return <Badge className="bg-blue-500 hover:bg-blue-600 text-white border-none">Teacher</Badge>;
      default:
        return <Badge className="bg-zinc-500 hover:bg-zinc-600 text-white border-none">Student</Badge>;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "login":
        return <Badge variant="outline" className="text-blue-500 border-blue-200 bg-blue-50/50">Login</Badge>;
      case "signup":
        return <Badge variant="outline" className="text-purple-500 border-purple-200 bg-purple-50/50">Signup</Badge>;
      case "db_seed":
        return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50/50">DB Seed</Badge>;
      case "teacher_bulk_import":
        return <Badge variant="outline" className="text-emerald-500 border-emerald-200 bg-emerald-50/50">Teacher Import</Badge>;
      case "student_bulk_import":
        return <Badge variant="outline" className="text-teal-500 border-teal-200 bg-teal-50/50">Student Import</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-500" />
            System Audit Logs
          </CardTitle>
          <CardDescription>
            Monitor user logins, account signups, and admin database modifications.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by user name, action, or details..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <div className="w-full md:w-48">
            <Select
              value={roleFilter}
              onValueChange={(val) => {
                setRoleFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="teacher">Teacher</SelectItem>
                <SelectItem value="student">Student</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full md:w-48">
            <Select
              value={actionFilter}
              onValueChange={(val) => {
                setActionFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="signup">Signup</SelectItem>
                <SelectItem value="db_seed">DB Seed</SelectItem>
                <SelectItem value="teacher_bulk_import">Teacher Import</SelectItem>
                <SelectItem value="student_bulk_import">Student Import</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Logs Table */}
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">No audit logs found matching your filters.</p>
        ) : (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="w-[120px]">Role</TableHead>
                  <TableHead className="w-[150px]">Action</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead className="w-[120px]">IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss")}
                    </TableCell>
                    <TableCell className="font-medium">{log.userName}</TableCell>
                    <TableCell>{getRoleBadge(log.userRole)}</TableCell>
                    <TableCell>{getActionBadge(log.action)}</TableCell>
                    <TableCell className="text-sm">{log.detail || "-"}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{log.ip || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              Showing page {page} of {totalPages} ({total} total logs)
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
