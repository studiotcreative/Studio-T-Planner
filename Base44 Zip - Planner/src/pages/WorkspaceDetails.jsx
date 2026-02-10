// src/pages/WorkspaceDetails.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { supabase } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  ArrowLeft,
  Plus,
  Users,
  Trash2,
  Pencil,
  MoreVertical,
  Loader2,
  Building2,
  Book,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import PlatformIcon, { platformConfig } from "@/components/ui/PlatformIcon";

export default function WorkspaceDetails() {
  const navigate = useNavigate();
  const { isAdmin, isAccountManager, workspaceMemberships, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const urlParams = new URLSearchParams(window.location.search);
  const workspaceId = urlParams.get("id");

  // --- Access rules ---
  const isAssignedAccountManager =
    !!workspaceId &&
    (workspaceMemberships ?? []).some(
      (m) => m.workspace_id === workspaceId && m.role === "account_manager"
    );

  const canAccessWorkspace = isAdmin() || (isAccountManager() && isAssignedAccountManager);
  const canEditWorkspace = canAccessWorkspace; // AM can edit inside assigned workspace
  const canManageMembers = isAdmin(); // keep member management admin-only

  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [showMemberDialog, setShowMemberDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);

  const [accountForm, setAccountForm] = useState({
    platform: "instagram",
    handle: "",
    display_name: "",
    assigned_manager_email: "",
  });

  const [memberForm, setMemberForm] = useState({
    user_id: "",
    role: "client_viewer",
  });

  // -------------------------
  // Queries
  // -------------------------

  const { data: workspace, isLoading: loadingWorkspace } = useQuery({
    queryKey: ["workspace", workspaceId],
    enabled: !!workspaceId && !authLoading && canAccessWorkspace,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("*")
        .eq("id", workspaceId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["workspace-accounts", workspaceId],
    enabled: !!workspaceId && !authLoading && canAccessWorkspace,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_accounts")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["workspace-members", workspaceId],
    enabled: !!workspaceId && !authLoading && canAccessWorkspace,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select(
          `
          workspace_id,
          user_id,
          role,
          created_at,
          profiles:profiles ( id, full_name, role, email )
        `
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

  // IMPORTANT: keep global user list admin-only (prevents "global user management" exposure)
  const { data: allUsers = [] } = useQuery({
    queryKey: ["profiles"],
    enabled: canManageMembers,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, email")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // -------------------------
  // Mutations (Accounts)
  // -------------------------

  const createAccountMutation = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from("social_accounts")
        .insert([{ ...payload, workspace_id: workspaceId }])
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-accounts", workspaceId] });
      setShowAccountDialog(false);
      resetAccountForm();
      toast.success("Account added");
    },
    onError: (err) => {
      console.error("[WorkspaceDetails] create account error:", err);
      toast.error(err?.message || "Failed to add account");
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: async ({ id, data: payload }) => {
      const { data, error } = await supabase
        .from("social_accounts")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-accounts", workspaceId] });
      setShowAccountDialog(false);
      resetAccountForm();
      toast.success("Account updated");
    },
    onError: (err) => {
      console.error("[WorkspaceDetails] update account error:", err);
      toast.error(err?.message || "Failed to update account");
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("social_accounts").delete().eq("id", id);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-accounts", workspaceId] });
      toast.success("Account removed");
    },
    onError: (err) => {
      console.error("[WorkspaceDetails] delete account error:", err);
      toast.error(err?.message || "Failed to remove account");
    },
  });

  // -------------------------
  // Mutations (Members) - ADMIN ONLY
  // -------------------------

  const createMemberMutation = useMutation({
    mutationFn: async ({ user_id, role }) => {
      const { data, error } = await supabase
        .from("workspace_members")
        .insert([{ workspace_id: workspaceId, user_id, role }])
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-members", workspaceId] });
      setShowMemberDialog(false);
      setMemberForm({ user_id: "", role: "client_viewer" });
      toast.success("Member added");
    },
    onError: (err) => {
      console.error("[WorkspaceDetails] add member error:", err);
      toast.error(err?.message || "Failed to add member");
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async ({ user_id }) => {
      const { error } = await supabase
        .from("workspace_members")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("user_id", user_id);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-members", workspaceId] });
      toast.success("Member removed");
    },
    onError: (err) => {
      console.error("[WorkspaceDetails] remove member error:", err);
      toast.error(err?.message || "Failed to remove member");
    },
  });

  // -------------------------
  // Helpers
  // -------------------------

  const resetAccountForm = () => {
    setEditingAccount(null);
    setAccountForm({
      platform: "instagram",
      handle: "",
      display_name: "",
      assigned_manager_email: "",
    });
  };

  const openEditAccountDialog = (account) => {
    setEditingAccount(account);
    setAccountForm({
      platform: account.platform ?? "instagram",
      handle: account.handle ?? "",
      display_name: account.display_name ?? "",
      assigned_manager_email: account.assigned_manager_email ?? "",
    });
    setShowAccountDialog(true);
  };

  const handleAccountSubmit = (e) => {
    e.preventDefault();
    if (!accountForm.handle) {
      toast.error("Please enter a handle/username");
      return;
    }
    if (editingAccount) updateAccountMutation.mutate({ id: editingAccount.id, data: accountForm });
    else createAccountMutation.mutate(accountForm);
  };

  const handleMemberSubmit = (e) => {
    e.preventDefault();
    if (!memberForm.user_id) {
      toast.error("Please select a user");
      return;
    }
    createMemberMutation.mutate(memberForm);
  };

  const usersById = useMemo(() => {
    const map = new Map();
    (allUsers ?? []).forEach((u) => map.set(u.id, u));
    return map;
  }, [allUsers]);

  const getInitials = (fullNameOrEmail) => {
    if (!fullNameOrEmail) return "U";
    const parts = String(fullNameOrEmail).trim().split(" ");
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "U";
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // -------------------------
  // Guards / Loading states
  // -------------------------

  if (authLoading) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Skeleton className="h-8 w-48 mb-8" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500">Workspace not found</p>
      </div>
    );
  }

  if (!canAccessWorkspace) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-center text-slate-500">You don't have access to this workspace.</p>
      </div>
    );
  }

  if (loadingWorkspace) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Skeleton className="h-8 w-48 mb-8" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500">Workspace not found</p>
      </div>
    );
  }

  // -------------------------
  // UI
  // -------------------------

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <div className="flex-1 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white font-semibold text-lg">
            {(workspace.name?.[0] ?? "W").toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{workspace.name}</h1>
            {workspace.slug ? <p className="text-slate-500">/{workspace.slug}</p> : null}
          </div>
        </div>

        {/* AM + Admin can open Brand Guidelines */}
        <Button
          onClick={() => navigate(createPageUrl(`BrandGuidelines?workspace=${workspaceId}`))}
          variant="outline"
          className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 hover:from-purple-100 hover:to-pink-100"
          disabled={!canEditWorkspace}
        >
          <Book className="w-4 h-4 mr-2 text-purple-600" />
          <span className="text-purple-700 font-medium">Brand Guidelines</span>
        </Button>
      </div>

      <Tabs defaultValue="accounts" className="space-y-6">
        <TabsList className="bg-white border border-slate-200">
          <TabsTrigger value="accounts">Social Accounts</TabsTrigger>
          <TabsTrigger value="members">Team Members</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>

        {/* Social Accounts Tab */}
        <TabsContent value="accounts">
          <Card className="bg-white border-slate-200/60">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Social Accounts</CardTitle>

              <Button
                onClick={() => {
                  resetAccountForm();
                  setShowAccountDialog(true);
                }}
                disabled={!canEditWorkspace}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Account
              </Button>
            </CardHeader>

            <CardContent>
              {accounts.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <Users className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-slate-500">No social accounts yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-white"
                    >
                      <div className="flex items-center gap-3">
                        <PlatformIcon platform={account.platform} />
                        <div>
                          <p className="font-medium text-slate-900">
                            {account.display_name || `@${account.handle}`}
                          </p>
                          <p className="text-sm text-slate-500">
                            @{account.handle} • {platformConfig?.[account.platform]?.label || account.platform}
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
                          <DropdownMenuItem
                            onClick={() => openEditAccountDialog(account)}
                            disabled={!canEditWorkspace}
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => deleteAccountMutation.mutate(account.id)}
                            disabled={!canEditWorkspace}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Members Tab (view for AM, manage for admin) */}
        <TabsContent value="members">
          <Card className="bg-white border-slate-200/60">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Team Members</CardTitle>

              <Button
                onClick={() => setShowMemberDialog(true)}
                disabled={!canManageMembers}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Member
              </Button>
            </CardHeader>

            <CardContent>
              {members.length === 0 ? (
                <p className="text-slate-500">No members found.</p>
              ) : (
                <div className="space-y-3">
                  {members.map((m) => {
                    const p = m.profiles ?? usersById.get(m.user_id);
                    const label = p?.full_name || p?.email || m.user_id;
                    return (
                      <div
                        key={`${m.workspace_id}-${m.user_id}`}
                        className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-white"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>{getInitials(label)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-slate-900">{label}</p>
                            <p className="text-sm text-slate-500">{m.role}</p>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          className="text-red-600"
                          onClick={() => deleteMemberMutation.mutate({ user_id: m.user_id })}
                          disabled={!canManageMembers}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Overview Tab (leave as-is / simple) */}
        <TabsContent value="overview">
          <Card className="bg-white border-slate-200/60">
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">
                Workspace details and quick stats live here.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Account Dialog */}
      <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAccount ? "Edit Account" : "Add Account"}</DialogTitle>
            <DialogDescription>
              {editingAccount ? "Update this social account" : "Add a new social account"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAccountSubmit} className="space-y-4">
            <div>
              <Label>Platform</Label>
              <Select
                value={accountForm.platform}
                onValueChange={(v) => setAccountForm((p) => ({ ...p, platform: v }))}
                disabled={!canEditWorkspace}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Handle</Label>
              <Input
                value={accountForm.handle}
                onChange={(e) => setAccountForm((p) => ({ ...p, handle: e.target.value }))}
                className="mt-1.5"
                disabled={!canEditWorkspace}
              />
            </div>

            <div>
              <Label>Display Name</Label>
              <Input
                value={accountForm.display_name}
                onChange={(e) => setAccountForm((p) => ({ ...p, display_name: e.target.value }))}
                className="mt-1.5"
                disabled={!canEditWorkspace}
              />
            </div>

            <div>
              <Label>Assigned Manager Email (Optional)</Label>
              <Input
                value={accountForm.assigned_manager_email}
                onChange={(e) =>
                  setAccountForm((p) => ({ ...p, assigned_manager_email: e.target.value }))
                }
                className="mt-1.5"
                disabled={!canEditWorkspace}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAccountDialog(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !canEditWorkspace ||
                  createAccountMutation.isPending ||
                  updateAccountMutation.isPending
                }
              >
                {(createAccountMutation.isPending || updateAccountMutation.isPending) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {editingAccount ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog (admin-only) */}
      <Dialog
        open={showMemberDialog}
        onOpenChange={(open) => {
          if (!canManageMembers) return;
          setShowMemberDialog(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
            <DialogDescription>Add a user to this workspace</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleMemberSubmit} className="space-y-4">
            <div>
              <Label>User</Label>
              <Select
                value={memberForm.user_id}
                onValueChange={(v) => setMemberForm((p) => ({ ...p, user_id: v }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {(allUsers ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Role</Label>
              <Select
                value={memberForm.role}
                onValueChange={(v) => setMemberForm((p) => ({ ...p, role: v }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="account_manager">account_manager</SelectItem>
                  <SelectItem value="client_approver">client_approver</SelectItem>
                  <SelectItem value="client_viewer">client_viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowMemberDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMemberMutation.isPending}>
                {createMemberMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

