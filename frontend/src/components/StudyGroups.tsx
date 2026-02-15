import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Users, 
  Plus, 
  Search, 
  MessageSquare, 
  Calendar, 
  BookOpen, 
  Star,
  UserPlus,
  Clock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";

interface StudyGroup {
  id: string;
  name: string;
  description: string;
  subject: string;
  creatorId: string;
  creatorName: string;
  members: Array<{
    id: string;
    name: string;
    joinedAt: string;
  }>;
  maxMembers: number;
  isPrivate: boolean;
  createdAt: string;
  lastActivity?: string;
  tags: string[];
}

export function StudyGroups() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newGroup, setNewGroup] = useState({
    name: "",
    description: "",
    subject: "",
    maxMembers: 10,
    isPrivate: false,
    tags: [] as string[]
  });

  const { data: groups = [], isLoading } = useQuery<StudyGroup[]>({
    queryKey: ["/api/study-groups"],
    refetchInterval: 30000,
  });

  const { data: myGroups = [] } = useQuery<StudyGroup[]>({
    queryKey: ["/api/study-groups/my"],
  });

  const createGroupMutation = useMutation({
    mutationFn: async (groupData: typeof newGroup) => {
      const res = await apiRequest("POST", "/api/study-groups", groupData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/study-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/study-groups/my"] });
      setCreateDialogOpen(false);
      setNewGroup({
        name: "",
        description: "",
        subject: "",
        maxMembers: 10,
        isPrivate: false,
        tags: []
      });
      toast({
        title: "Study group created!",
        description: "Your study group has been created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create group",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const joinGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const res = await apiRequest("POST", `/api/study-groups/${groupId}/join`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/study-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/study-groups/my"] });
      toast({
        title: "Joined group!",
        description: "You've successfully joined the study group.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to join group",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const subjects = Array.from(new Set(groups.map(g => g.subject))).filter(Boolean);
  
  const filteredGroups = groups.filter(group => {
    const matchesSearch = group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         group.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSubject = selectedSubject === "all" || group.subject === selectedSubject;
    return matchesSearch && matchesSubject;
  });

  const myGroupIds = new Set(myGroups.map(g => g.id));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Study Groups
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Connect with peers and learn together
              </p>
            </div>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Group
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Study Group</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Group Name</label>
                    <Input
                      value={newGroup.name}
                      onChange={(e) => setNewGroup(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter group name"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Description</label>
                    <Textarea
                      value={newGroup.description}
                      onChange={(e) => setNewGroup(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Describe your study group"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Subject</label>
                    <Input
                      value={newGroup.subject}
                      onChange={(e) => setNewGroup(prev => ({ ...prev, subject: e.target.value }))}
                      placeholder="e.g., Mathematics, Physics"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Max Members</label>
                    <Input
                      type="number"
                      min="2"
                      max="50"
                      value={newGroup.maxMembers}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setNewGroup(prev => ({ ...prev, maxMembers: isNaN(val) ? 2 : Math.max(2, Math.min(50, val)) }))
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="private"
                      checked={newGroup.isPrivate}
                      onChange={(e) => setNewGroup(prev => ({ ...prev, isPrivate: e.target.checked }))}
                    />
                    <label htmlFor="private" className="text-sm">Private group</label>
                  </div>
                  <Button 
                    onClick={() => createGroupMutation.mutate(newGroup)}
                    disabled={createGroupMutation.isPending || !newGroup.name || !newGroup.subject}
                    className="w-full"
                  >
                    Create Group
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search groups..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="all">All Subjects</option>
              {subjects.map(subject => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </select>
          </div>

          {/* Groups Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGroups.map((group) => (
              <Card key={group.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{group.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {group.description}
                      </p>
                    </div>
                    {group.isPrivate && (
                      <Badge variant="secondary" className="ml-2">Private</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{group.subject}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {group.members.length}/{group.maxMembers} members
                    </span>
                  </div>

                  {group.lastActivity && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        Active {formatDistanceToNow(new Date(group.lastActivity), { addSuffix: true })}
                      </span>
                    </div>
                  )}

                  {group.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {group.tags.map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">
                        {(group.creatorName ?? "C")
                          .trim()
                          .split(/\s+/)
                          .filter(Boolean)
                          .map(n => n[0])
                          .join('')
                          .toUpperCase() || "C"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">
                      Created by {group.creatorName}
                    </span>
                  </div>

                  {!myGroupIds.has(group.id) && group.members.length < group.maxMembers && (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => joinGroupMutation.mutate(group.id)}
                      disabled={joinGroupMutation.isPending}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Join Group
                    </Button>
                  )}

                  {myGroupIds.has(group.id) && (
                    <Button size="sm" variant="outline" className="w-full" disabled>
                      <MessageSquare className="h-4 w-4 mr-2" />
                      View Group
                    </Button>
                  )}

                  {group.members.length >= group.maxMembers && !myGroupIds.has(group.id) && (
                    <Button size="sm" variant="outline" className="w-full" disabled>
                      Group Full
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredGroups.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No study groups found matching your criteria</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
