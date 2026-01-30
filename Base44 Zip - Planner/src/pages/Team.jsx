// src/pages/Team.jsx
import React, { useMemo, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { Search, Shield, Users, Briefcase, Plus } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PlatformIcon from "@/components/ui/PlatformIcon";

export default function Team() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteGlobalRole, setInviteGlobalRole] = useState("user"); // user|admin
  const [inviteWorkspaceId, setInviteWorkspaceId] = useState("");
  const [inviteWorkspaceRole, setInviteWorkspaceRole] = useState("viewer"); // workspace_role enum
  const [saving, setSaving] = useState(false);

  // 1) Users (with email) via admin RPC
  const {
    data: users = [],
    isLoading: loadingUsers,
    error: usersErr,
  } = useQuery({
    queryKey: ["admin_users"],
    queryFn: async () => {
      // RPC returns: id, email, full_name, role, created_at
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin(),
  });

  // 2) Social accounts (for "assigned accounts" UI)
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_accounts")
        .select("id, platform, handle, created_at")
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin(),
  });

  // 3) Workspaces (for assignment dropdown)
  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin(),
  });

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;

    return users.filter((u) => {
      const name = (u.full_name ?? "").toLowerCase();
      const email = (u.email ?? "").toLowerCase();
      const role = String(u.role ?? "").toLowerCase();
      return name.includes(q) || email.includes(q) || role.includes(q);
    });
  }, [users, search]);

  const getInitials = (nameOrEmail) => {
    const s = (nameOrEmail ?? "").trim();
    if (!s) return "?";
    const parts = s.split(" ");
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getAssignedAccounts = (email) => {
    if (!email) return [];
    return accounts.filter((a) => a.assigned_manager_email === email);
  };

  const getRoleBadge = (role) => {
    if (role === "admin") {
      return <Badge className="bg-violet-100 text-violet-700">Admin</Badge>;
    }
    return <Badge className="bg-slate-100 text-slate-700">User</Badge>;
  };

  const updateGlobalRole = async (userId, newRole) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ role: newRole })
        .eq("id", userId);

      if (error) throw error;

      await qc.invalidateQueries({ queryKey: ["admin_users"] });
    } catch (e) {
      console.error(e);
      alert(e?.message ?? "Failed to update role.");
    } finally {
      setSaving(false);
    }
  };

  const assignToWorkspace = async (userId, workspaceId, role) => {
    if (!workspaceId) return;

    setSaving(true);
    try {
      const { error } = await supabase.from("workspace_members").upsert(
        {
          workspace_id: workspaceId,
          user_id: userId,
          role,
        },
        { onConflict: "workspace_id,user_id" }
      );

      if (error) throw error;

      alert("Workspace role updated.");
    } catch (e) {
      console.error(e);
      alert(e?.message ?? "Failed to assign workspace role.");
    } finally {
      setSaving(false);
    }
  };

  /**
   * ✅ FIXED INVITE FLOW:
   * - Calls Edge Function: invite-user
   * - Sends: email, global role, workspace_id, workspace_role
   * - Edge Function should:
   *   1) verify caller is admin
   *   2) invite user
   *   3) upsert profiles.role
   *   4) upsert workspace_members (if workspace_id + workspace_role provided)
   *   5) return { success: true, user_id }
   */
  const inviteUser = async () => {
    const email = inviteEmail.trim();
    if (!email) return;

    setSaving(true);
    try {
      const payload = {
        email,
        role: inviteGlobalRole, // "admin" | "user"
        workspace_id: inviteWorkspaceId || null,
        workspace_role: inviteWorkspaceId ? inviteWorkspaceRole : null,
      };

      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: payload,
      });

      if (error) {
        // Supabase function invoke errors often include a generic message.
        // This logs the full object for debugging.
        console.error("Edge Function error:", error);
        throw error;
      }

      const invitedUserId = data?.user_id ?? null;

      // Refresh admin list
      await qc.invalidateQueries({ queryKey: ["admin_users"] });

      // Reset form
      setInviteEmail("");
      setInviteGlobalRole("user");
      setInviteWorkspaceId("");
      setInviteWorkspaceRole("viewer");

      alert(
        invitedUserId
          ? "Invite sent. User was assigned (if workspace selected)."
          : "Invite sent."
      );
    } catch (e) {
      console.error(e);
      alert(e?.message ?? "Invite failed. Check console.");
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin()) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-center text-slate-500">
          You don't have access to this page.
        </p>
      </div>
    );
  }

  const adminCount = users.filter((u) => u.role === "admin").length;
  const accountManagerCount = new Set(
    accounts.map((a) => a.assigned_manager_email).filter(Boolean)
  ).size;

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team</h1>
          <p className="text-slate-500 mt-1">{users.length} team members</p>
        </div>
      </div>

      {/* Invite */}
      <Card className="bg-white border-slate-200/60 mb-6">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <Plus className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Invite a new member</p>
              <p className="text-sm text-slate-500">
                Invites the user, sets global role, and assigns them to a workspace (optional).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <p className="text-sm text-slate-600 mb-1">Email</p>
              <Input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@company.com"
                autoComplete="email"
              />
            </div>

            <div>
              <p className="text-sm text-slate-600 mb-1">Global role</p>
              <select
                className="w-full h-10 border rounded-md px-3"
                value={inviteGlobalRole}
                onChange={(e) => setInviteGlobalRole(e.target.value)}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>

            <div>
              <p className="text-sm text-slate-600 mb-1">Workspace (optional)</p>
              <select
                className="w-full h-10 border rounded-md px-3"
                value={inviteWorkspaceId}
                onChange={(e) => setInviteWorkspaceId(e.target.value)}
              >
                <option value="">(none)</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-sm text-slate-600 mb-1">Workspace role</p>
              <select
                className="w-full h-10 border rounded-md px-3"
                value={inviteWorkspaceRole}
                onChange={(e) => setInviteWorkspaceRole(e.target.value)}
                disabled={!inviteWorkspaceId}
                title={!inviteWorkspaceId ? "Select a workspace first" : "Workspace role"}
              >
                <option value="viewer">viewer</option>
                <option value="client_viewer">client_viewer</option>
                <option value="client_approver">client_approver</option>
                <option value="account_manager">account_manager</option>
              </select>
            </div>

            <div className="md:col-span-3" />

            <div className="flex items-end">
              <Button
                disabled={saving || !inviteEmail.trim()}
                onClick={inviteUser}
                className="w-full"
              >
                {saving ? "Working..." : "Invite"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search team members..."
          className="pl-10 bg-white"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="bg-white border-slate-200/60">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Users</p>
                <p className="text-2xl font-bold text-slate-900">{users.length}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200/60">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Admins</p>
                <p className="text-2xl font-bold text-slate-900">{adminCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                <Shield className="w-5 h-5 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200/60">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Account Managers</p>
                <p className="text-2xl font-bold text-slate-900">{accountManagerCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200/60">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Workspaces</p>
                <p className="text-2xl font-bold text-slate-900">{workspaces.length}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team List */}
      {loadingUsers ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : usersErr ? (
        <div className="text-red-600 text-sm bg-white border rounded-xl p-4">
          Failed to load users. This is usually missing the Admin RPC or policies.
          <div className="mt-2 text-slate-700">
            Error: {String(usersErr?.message ?? usersErr)}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/60 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filteredUsers.map((user) => {
              const assignedAccounts = getAssignedAccounts(user.email);

              return (
                <div key={user.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <Avatar className="w-12 h-12">
                        <AvatarFallback className="bg-gradient-to-br from-violet-500 to-indigo-500 text-white font-medium">
                          {getInitials(user.full_name || user.email)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-slate-900 truncate">
                            {user.full_name || "No name"}
                          </h3>
                          {getRoleBadge(user.role)}
                        </div>
                        <p className="text-sm text-slate-500 truncate">{user.email || ""}</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <select
                        className="h-9 border rounded-md px-2 text-sm"
                        value={user.role}
                        onChange={(e) => updateGlobalRole(user.id, e.target.value)}
                        disabled={saving}
                        title="Global role"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>

                      <select
                        className="h-9 border rounded-md px-2 text-sm"
                        defaultValue=""
                        onChange={(e) => {
                          const wsId = e.target.value;
                          if (!wsId) return;
                          assignToWorkspace(user.id, wsId, "viewer");
                          e.target.value = "";
                        }}
                        disabled={saving}
                        title="Assign to workspace"
                      >
                        <option value="">Add to workspace…</option>
                        {workspaces.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Assigned accounts */}
                  {assignedAccounts.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-slate-500 mr-2">Assigned accounts:</span>
                        {assignedAccounts.slice(0, 6).map((account) => (
                          <div
                            key={account.id}
                            className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-full text-xs"
                          >
                            <PlatformIcon platform={account.platform} size="sm" />
                            @{account.handle}
                          </div>
                        ))}
                        {assignedAccounts.length > 6 && (
                          <span className="text-xs text-slate-500">
                            +{assignedAccounts.length - 6} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


