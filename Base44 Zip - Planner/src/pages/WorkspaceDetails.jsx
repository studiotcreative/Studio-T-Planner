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
  UserPlus,
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
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const urlParams = new URLSearchParams(window.location.search);
  const workspaceId = urlParams.get("id");

  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [showMemberDialog, setShowMemberDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);

  const [accountForm, setAccountForm] = useState({
    platform: "instagram",
    handle: "",
    display_name: "",
    assigned_manager_email: "",
  });

  // Supabase uses user_id for workspace members (not email)
  const [memberForm, setMemberForm] = useState({
    user_id: "",
    role: "client_viewer",
  });

  // -------------------------
  // Queries
  // -------------------------

  const { data: workspace, isLoading: loadingWorkspace } = useQuery({
    queryKey: ["workspace", workspaceId],
    enabled: !!workspaceId,
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
    enabled: !!workspaceId,
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

  // Load members + profile info (requires FK workspace_members.user_id -> profiles.id)
  const { data: members = [] } = useQuery({
    queryKey: ["workspace-members", workspaceId],
    enabled: !!workspaceId,
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

  // Users list comes from profiles (client-side safe)
  const { data: allUsers = [] } = useQuery({
    queryKey: ["profiles"],
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
      toast.error("Failed to add account");
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
      toast.error("Failed to update account");
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
      toast.error("Failed to remove account");
    },
  });

  // -------------------------
  // Mutations (Members)
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
      toast.error("Failed to add member (check RLS / duplicates)");
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async ({ user_id }) => {
      // workspace_members commonly has a composite PK (workspace_id, user_id)
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
      toast.error("Failed to remove member");
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

    if (editingAccount) {
      updateAccountMutation.mutate({ id: editingAccount.id, data: accountForm });
    } else {
      createAccountMutation.mutate(accountForm);
    }
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

  if (!isAdmin()) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-center text-slate-500">
          You don't have access to this page.
        </p>
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
            {workspace.slug ? (
              <p className="text-slate-500">/{workspace.slug}</p>
            ) : null}
          </div>
        </div>

        <Button
          onClick={() =>
            navigate(createPageUrl(`BrandGuidelines?workspace=${workspaceId}`))
          }
          variant="outline"
          className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 hover:from-purple-100 hover:to-pink-100"
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
                      className="flex items-center justify-between p-4 rounded-xl bg-slate-50"
                    >
                      <div className="flex items-center gap-3">
                        <PlatformIcon platform={account.platform} showBg />
                        <div>
                          <p className="font-medium text-slate-900">@{account.handle}</p>
                          <p className="text-sm text-slate-500">
                            {platformConfig[account.platform]?.label}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* assigned_manager_email is optional – keep it as plain text */}
                        <div className="text-right">
                          <p className="text-sm text-slate-500">Assigned to</p>
                          <p className="text-sm font-medium text-slate-700">
                            {account.assigned_manager_email || "—"}
                          </p>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditAccountDialog(account)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => {
                                if (confirm("Delete this account?")) {
                                  deleteAccountMutation.mutate(account.id);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Members Tab */}
        <TabsContent value="members">
          <Card className="bg-white border-slate-200/60">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Team Members</CardTitle>
              <Button onClick={() => setShowMemberDialog(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Add Member
              </Button>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <Users className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-slate-500">No members yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {members.map((member) => {
                    const profile =
                      member.profiles ||
                      usersById.get(member.user_id) ||
                      null;

                    const displayName =
                      profile?.full_name ||
                      profile?.email ||
                      member.user_id;

                    const email = profile?.email || "";

                    return (
                      <div
                        key={`${member.workspace_id}-${member.user_id}`}
                        className="flex items-center justify-between p-4 rounded-xl bg-slate-50"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="w-10 h-10">
                            <AvatarFallback className="bg-slate-200">
                              {getInitials(displayName)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-slate-900">{displayName}</p>
                            {email ? (
                              <p className="text-sm text-slate-500">{email}</p>
                            ) : (
                              <p className="text-xs text-slate-400">ID: {member.user_id}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              member.role === "client_approver"
                                ? "bg-violet-100 text-violet-700"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {String(member.role).replace("_", " ")}
                          </span>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Remove this member?")) {
                                deleteMemberMutation.mutate({ user_id: member.user_id });
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-white border-slate-200/60">
              <CardHeader>
                <CardTitle className="text-base">Workspace Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-slate-500">Name</p>
                  <p className="font-medium">{workspace.name}</p>
                </div>

                {workspace.slug ? (
                  <div>
                    <p className="text-sm text-slate-500">Slug</p>
                    <p className="font-medium">/{workspace.slug}</p>
                  </div>
                ) : null}

                {workspace.notes ? (
                  <div>
                    <p className="text-sm text-slate-500">Notes</p>
                    <p className="text-sm">{workspace.notes}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="bg-white border-slate-200/60">
              <CardHeader>
                <CardTitle className="text-base">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-slate-500">Social Accounts</p>
                  <p className="font-semibold text-xl">{accounts.length}</p>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-slate-500">Team Members</p>
                  <p className="font-semibold text-xl">{members.length}</p>
                </div>

                {"is_active" in workspace ? (
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-slate-500">Status</p>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        workspace.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {workspace.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Account Dialog */}
      <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAccount ? "Edit Account" : "Add Social Account"}</DialogTitle>
            <DialogDescription>
              {editingAccount ? "Update account details" : "Add a new social account to this workspace"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAccountSubmit} className="space-y-4">
            <div>
              <Label>Platform</Label>
              <Select
                value={accountForm.platform}
                onValueChange={(v) =>
                  setAccountForm((prev) => ({ ...prev, platform: v }))
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(platformConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <PlatformIcon platform={key} size="sm" />
                        {config.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Handle / Username *</Label>
              <Input
                value={accountForm.handle}
                onChange={(e) =>
                  setAccountForm((prev) => ({ ...prev, handle: e.target.value }))
                }
                placeholder="@username"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Display Name</Label>
              <Input
                value={accountForm.display_name}
                onChange={(e) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    display_name: e.target.value,
                  }))
                }
                placeholder="Account display name"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Assigned Account Manager (email)</Label>
              <Input
                value={accountForm.assigned_manager_email}
                onChange={(e) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    assigned_manager_email: e.target.value,
                  }))
                }
                placeholder="manager@email.com"
                className="mt-1.5"
              />
              <p className="text-xs text-slate-400 mt-1">
                (Optional) If you later switch to an ID-based assignment, we’ll update this field.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAccountDialog(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createAccountMutation.isPending || updateAccountMutation.isPending}
              >
                {(createAccountMutation.isPending || updateAccountMutation.isPending) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {editingAccount ? "Update" : "Add Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={showMemberDialog} onOpenChange={setShowMemberDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              In Supabase (client-side), you can only add users that already exist in <code>profiles</code>.
              If you need email invites, that requires a server/admin function.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleMemberSubmit} className="space-y-4">
            <div>
              <Label>User</Label>
              <Select
                value={memberForm.user_id}
                onValueChange={(v) => setMemberForm((prev) => ({ ...prev, user_id: v }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {allUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.email || u.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Role</Label>
              <Select
                value={memberForm.role}
                onValueChange={(v) => setMemberForm((prev) => ({ ...prev, role: v }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client_viewer">Client Viewer (view only)</SelectItem>
                  <SelectItem value="client_approver">Client Approver (can approve posts)</SelectItem>
                  <SelectItem value="account_manager">Account Manager (internal)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowMemberDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMemberMutation.isPending}>
                {createMemberMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Add Member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
