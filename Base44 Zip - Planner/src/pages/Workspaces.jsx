import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { supabase } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  Plus,
  Building2,
  Users,
  MoreVertical,
  Pencil,
  Trash2,
  Search,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import PlatformIcon from "@/components/ui/PlatformIcon";

const slugify = (s) =>
  (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

export default function Workspaces() {
  const { isAdmin, isAccountManager, loading } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState(null);
  const [formData, setFormData] = useState({ name: "", slug: "", notes: "" });

  const canViewWorkspaces = isAdmin() || isAccountManager();
  const canAdminWorkspaces = isAdmin();

  // 1) Get authed user id (needed for account_manager scoping)
  const { data: authUserRes, isLoading: loadingAuthUser } = useQuery({
    queryKey: ["auth-user"],
    enabled: !loading,
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data;
    },
  });

  const authedUserId = authUserRes?.user?.id ?? null;

  // 2) Workspaces query:
  //    - Admin: all workspaces
  //    - Account Manager: only workspaces where workspace_members.role = 'account_manager'
  const { data: workspaces = [], isLoading: loadingWorkspaces } = useQuery({
    queryKey: ["workspaces", authedUserId, canAdminWorkspaces],
    enabled: !loading && !loadingAuthUser && !!authedUserId && canViewWorkspaces,
    queryFn: async () => {
      if (canAdminWorkspaces) {
        const { data, error } = await supabase
          .from("workspaces")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;
        return data ?? [];
      }

      // account_manager: get assigned workspace ids
      const { data: memberships, error: memErr } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", authedUserId)
        .eq("role", "account_manager");

      if (memErr) throw memErr;

      const ids = (memberships ?? []).map((m) => m.workspace_id).filter(Boolean);
      if (ids.length === 0) return [];

      const { data: scoped, error: wsErr } = await supabase
        .from("workspaces")
        .select("*")
        .in("id", ids)
        .order("created_at", { ascending: false });

      if (wsErr) throw wsErr;
      return scoped ?? [];
    },
  });

  // Used to scope accounts/members to only visible workspaces for account_manager
  const workspaceIds = useMemo(() => workspaces.map((w) => w.id), [workspaces]);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", workspaceIds.join("|")],
    enabled: !loading && workspaceIds.length > 0 && canViewWorkspaces,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_accounts")
        .select("*")
        .in("workspace_id", workspaceIds);

      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["members", workspaceIds.join("|")],
    enabled: !loading && workspaceIds.length > 0 && canViewWorkspaces,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("*")
        .in("workspace_id", workspaceIds);

      if (error) throw error;
      return data ?? [];
    },
  });

  // ---- Mutations (admin-only actions in UI) ----
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const userId = userRes?.user?.id ?? null;
      if (!userId) throw new Error("No authenticated user");

      const { data: ws, error: wsErr } = await supabase
        .from("workspaces")
        .insert([
          {
            name: payload.name,
            slug: payload.slug,
            notes: payload.notes || null,
            is_active: true,
            created_by: userId,
          },
        ])
        .select("*")
        .single();

      if (wsErr) throw wsErr;
      if (!ws?.id) throw new Error("Workspace created but no id returned");

      // Optional: creator becomes a member (matches your prior behavior)
      const { error: wmErr } = await supabase
        .from("workspace_members")
        .upsert(
          { workspace_id: ws.id, user_id: userId, role: "account_manager" },
          { onConflict: "workspace_id,user_id" }
        );

      if (wmErr) throw wmErr;

      return ws;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["members"] });
      setShowDialog(false);
      resetForm();
      toast.success("Workspace created");
    },
    onError: (err) => {
      console.error("[Workspaces] create error:", err);
      toast.error(err?.message || err?.details || "Failed to create workspace");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const { error } = await supabase
        .from("workspaces")
        .update({
          name: data.name,
          slug: data.slug,
          notes: data.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setShowDialog(false);
      resetForm();
      toast.success("Workspace updated");
    },
    onError: (err) => {
      console.error("[Workspaces] update error:", err);
      toast.error(err?.message || "Failed to update workspace");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("workspaces").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success("Workspace deleted");
    },
    onError: (err) => {
      console.error("[Workspaces] delete error:", err);
      toast.error(err?.message || "Failed to delete workspace");
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }) => {
      const { error } = await supabase
        .from("workspaces")
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success(variables.is_active ? "Workspace activated" : "Workspace archived");
    },
    onError: (err) => {
      console.error("[Workspaces] toggle error:", err);
      toast.error(err?.message || "Failed to update status");
    },
  });

  // ---- Helpers ----
  const resetForm = () => {
    setEditingWorkspace(null);
    setFormData({ name: "", slug: "", notes: "" });
  };

  const openEditDialog = (workspace) => {
    setEditingWorkspace(workspace);
    setFormData({
      name: workspace.name ?? "",
      slug: workspace.slug ?? "",
      notes: workspace.notes ?? "",
    });
    setShowDialog(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const name = (formData.name || "").trim();
    if (!name) {
      toast.error("Please enter a workspace name");
      return;
    }

    const slug = (formData.slug || "").trim() || slugify(name);

    if (editingWorkspace) {
      updateMutation.mutate({
        id: editingWorkspace.id,
        data: { ...formData, name, slug },
      });
    } else {
      createMutation.mutate({ ...formData, name, slug });
    }
  };

  const handleDelete = (workspace) => {
    if (confirm(`Are you sure you want to delete "${workspace.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(workspace.id);
    }
  };

  const filteredWorkspaces = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return workspaces;
    return workspaces.filter((w) => (w.name || "").toLowerCase().includes(q));
  }, [workspaces, search]);

  const getWorkspaceStats = (workspaceId) => {
    const workspaceAccounts = accounts.filter((a) => a.workspace_id === workspaceId);
    const workspaceMembers = members.filter((m) => m.workspace_id === workspaceId);
    return { accounts: workspaceAccounts.length, members: workspaceMembers.length };
  };

  // ---- Guards ----
  if (loading || loadingAuthUser) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-10 w-full mb-6" />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (!canViewWorkspaces) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-center text-slate-500">You don't have access to this page.</p>
      </div>
    );
  }

  // ---- UI ----
  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Workspaces</h1>
          <p className="text-slate-500 mt-1">Manage client workspaces and social accounts</p>
        </div>

        {canAdminWorkspaces && (
          <Button
            className="bg-slate-900 hover:bg-slate-800"
            onClick={() => {
              resetForm();
              setShowDialog(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Workspace
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search workspaces..."
          className="pl-10 bg-white"
        />
      </div>

      {/* Workspaces Grid */}
      {loadingWorkspaces ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : filteredWorkspaces.length === 0 ? (
        <Card className="bg-white">
          <CardContent className="py-16 text-center">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No workspaces found</p>

            {canAdminWorkspaces && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  resetForm();
                  setShowDialog(true);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Workspace
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkspaces.map((workspace) => {
            const stats = getWorkspaceStats(workspace.id);
            const workspaceAccounts = accounts.filter((a) => a.workspace_id === workspace.id);

            return (
              <Card
                key={workspace.id}
                className="bg-white border-slate-200/60 hover:border-slate-300 transition-colors"
              >
                <CardHeader className="flex flex-row items-start justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white font-semibold text-lg">
                      {(workspace.name || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{workspace.name}</CardTitle>
                      <p className="text-sm text-slate-500">
                        {workspace.slug ? `/${workspace.slug}` : ""}
                      </p>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end">
                      <Link to={createPageUrl(`WorkspaceDetails?id=${workspace.id}`)}>
                        <DropdownMenuItem>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                      </Link>

                      {canAdminWorkspaces && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openEditDialog(workspace)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleDelete(workspace)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>

                <CardContent>
                  {/* Status Toggle */}
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">Status:</span>
                      <span className={`text-sm ${workspace.is_active ? "text-green-600" : "text-slate-400"}`}>
                        {workspace.is_active ? "Active" : "Archived"}
                      </span>
                    </div>

                    <Switch
                      checked={workspace.is_active ?? true}
                      disabled={!canAdminWorkspaces}
                      onCheckedChange={(checked) => {
                        if (!canAdminWorkspaces) return;
                        toggleActiveMutation.mutate({ id: workspace.id, is_active: checked });
                      }}
                    />
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                      <Users className="w-4 h-4" />
                      {stats.members} members
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                      {stats.accounts} accounts
                    </div>
                  </div>

                  {/* Accounts */}
                  <div className="flex flex-wrap gap-2">
                    {workspaceAccounts.slice(0, 4).map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 rounded-full text-xs"
                      >
                        <PlatformIcon platform={account.platform} size="sm" />
                        <span className="text-slate-600">@{account.handle}</span>
                      </div>
                    ))}
                    {workspaceAccounts.length > 4 && (
                      <span className="px-2 py-1 bg-slate-100 rounded-full text-xs text-slate-500">
                        +{workspaceAccounts.length - 4} more
                      </span>
                    )}
                  </div>

                  <Link to={createPageUrl(`WorkspaceDetails?id=${workspace.id}`)}>
                    <Button variant="ghost" className="w-full mt-4" size="sm">
                      Manage Workspace
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog (admin-only usage) */}
      <Dialog
        open={showDialog}
        onOpenChange={(open) => {
          if (!canAdminWorkspaces) return;
          setShowDialog(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingWorkspace ? "Edit Workspace" : "New Workspace"}</DialogTitle>
            <DialogDescription>
              {editingWorkspace ? "Update workspace details" : "Create a new client workspace"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Workspace Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Acme Corp"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>URL Slug</Label>
              <Input
                value={formData.slug}
                onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                placeholder="e.g., acme-corp"
                className="mt-1.5"
              />
              <p className="text-xs text-slate-500 mt-1">Leave blank to auto-generate from name</p>
            </div>

            <div>
              <Label>Notes (Optional)</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Internal notes about this client"
                className="mt-1.5"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {editingWorkspace ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

