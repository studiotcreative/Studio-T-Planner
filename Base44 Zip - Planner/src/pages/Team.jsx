// src/pages/Team.jsx
import React, { useMemo, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { Search, Shield, Users, Plus, Trash2, UserX } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const ALLOWED_WORKSPACE_ROLES = ["account_manager", "client_viewer", "client_approver"];

function safeMessage(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  return err?.message || err?.error?.message || JSON.stringify(err);
}

function getInitials(nameOrEmail) {
  const s = (nameOrEmail ?? "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return (parts[0][0] ?? "?").toUpperCase();
  return ((parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "")).toUpperCase() || "?";
}

function RoleBadge({ role }) {
  if (role === "admin") {
    return <Badge className="bg-violet-100 text-violet-700">Admin</Badge>;
  }
  return <Badge className="bg-slate-100 text-slate-700">User</Badge>;
}

export default function Team() {
  const { isAdmin, user } = useAuth(); // assumes isAdmin() exists + user
  const qc = useQueryClient();

  // UI state
  const [search, setSearch] = useState("");

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteGlobalRole, setInviteGlobalRole] = useState("user"); // user|admin
  const [inviteWorkspaceId, setInviteWorkspaceId] = useState("");
  // ✅ FIX: must match enum (viewer is NOT allowed)
  const [inviteWorkspaceRole, setInviteWorkspaceRole] = useState("client_viewer");

  // Action state
  const [busyKey, setBusyKey] = useState(""); // e.g. "invite" | "role:<id>" | "delete:<id>"...
  const busy = (key) => busyKey === key;
  const anyBusy = Boolean(busyKey);

  // --- Queries ---

  // Admin users list (RPC)
  const {
    data: users = [],
    isLoading: loadingUsers,
    error: usersErr,
  } = useQuery({
    queryKey: ["admin_users"],
    enabled: typeof isAdmin === "function" ? isAdmin() : Boolean(isAdmin),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Workspaces (optional dropdown). If this errors (you currently have 500s),
  // we keep the page working and show a small warning.
  const {
    data: workspaces = [],
    isLoading: loadingWorkspaces,
    error: workspacesErr,
    refetch: refetchWorkspaces,
  } = useQuery({
    queryKey: ["workspaces"],
    enabled: typeof isAdmin === "function" ? isAdmin() : Boolean(isAdmin),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
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

  const adminCount = useMemo(() => users.filter((u) => u.role === "admin").length, [users]);

  // --- Helpers ---

  async function getAccessTokenOrThrow() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token;
    if (!token) throw new Error("No access token. Please log in again.");
    return token;
  }

  // --- Actions ---

  async function inviteUser() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;

    setBusyKey("invite");
    try {
      const token = await getAccessTokenOrThrow();

      // ✅ Guard: only send allowed enum roles if a workspace is selected
      const wsRole = inviteWorkspaceId ? inviteWorkspaceRole : null;
      if (wsRole && !ALLOWED_WORKSPACE_ROLES.includes(wsRole)) {
        throw new Error(`Invalid workspace role: ${wsRole}`);
      }

      const payload = {
        email,
        role: inviteGlobalRole, // "admin" | "user"
        workspace_id: inviteWorkspaceId || null,
        workspace_role: inviteWorkspaceId ? wsRole : null,
      };

      // IMPORTANT: attach Authorization header explicitly
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: payload,
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) {
        // This often contains a generic message; try to surface details:
        const msg = error?.context?.response
          ? await error.context.response.text().catch(() => null)
          : null;

        if (msg) {
          try {
            const parsed = JSON.parse(msg);
            throw new Error(parsed?.error || parsed?.message || msg);
          } catch {
            throw new Error(msg);
          }
        }

        throw new Error(error.message || "Invite failed");
      }

      await qc.invalidateQueries({ queryKey: ["admin_users"] });

      // Reset form
      setInviteEmail("");
      setInviteGlobalRole("user");
      setInviteWorkspaceId("");
      // ✅ FIX: reset to valid enum
      setInviteWorkspaceRole("client_viewer");

      alert(data?.mode === "existing" ? "User updated ✅" : "Invite sent ✅");
    } catch (e) {
      console.error("inviteUser error:", e);
      alert(safeMessage(e));
    } finally {
      setBusyKey("");
    }
  }

  async function updateGlobalRole(targetUserId, newRole) {
    if (!targetUserId) return;
    const key = `role:${targetUserId}`;

    // prevent self-role change here (optional safety)
    if (user?.id && targetUserId === user.id) {
      alert("You cannot change your own role here.");
      return;
    }

    setBusyKey(key);
    try {
      const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", targetUserId);
      if (error) throw error;

      await qc.invalidateQueries({ queryKey: ["admin_users"] });
      alert("Role updated ✅");
    } catch (e) {
      console.error("updateGlobalRole error:", e);
      alert(safeMessage(e));
    } finally {
      setBusyKey("");
    }
  }

  async function assignToWorkspace(targetUserId, workspaceId, role) {
    if (!targetUserId || !workspaceId) return;
    const key = `ws:${targetUserId}:${workspaceId}`;

    // ✅ Guard: never allow invalid enum values
    if (!ALLOWED_WORKSPACE_ROLES.includes(role)) {
      alert(`Invalid workspace role: ${role}`);
      return;
    }

    setBusyKey(key);
    try {
      const { error } = await supabase.from("workspace_members").upsert(
        { workspace_id: workspaceId, user_id: targetUserId, role },
        { onConflict: "workspace_id,user_id" }
      );

      if (error) throw error;
      alert("Workspace membership updated ✅");
    } catch (e) {
      console.error("assignToWorkspace error:", e);
      alert(safeMessage(e));
    } finally {
      setBusyKey("");
    }
  }

  async function removeUser(targetUserId, mode) {
    if (!targetUserId) return;

    // prevent self-remove
    if (user?.id && targetUserId === user.id) {
      alert("You cannot remove yourself.");
      return;
    }

    const confirmText =
      mode === "hard"
        ? "This will permanently delete the user (cannot be undone). Type DELETE to confirm:"
        : "This will remove the user from ALL workspaces (they will lose access). Type REMOVE to confirm:";

    const required = mode === "hard" ? "DELETE" : "REMOVE";
    const typed = window.prompt(confirmText);
    if (typed !== required) return;

    const key = `delete:${targetUserId}:${mode}`;
    setBusyKey(key);

    try {
      const token = await getAccessTokenOrThrow();

      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: targetUserId, mode },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) {
        const msg = error?.context?.response
          ? await error.context.response.text().catch(() => null)
          : null;

        if (msg) {
          try {
            const parsed = JSON.parse(msg);
            throw new Error(parsed?.error || parsed?.message || msg);
          } catch {
            throw new Error(msg);
          }
        }

        throw new Error(error.message || "Delete failed");
      }

      console.log("delete-user result:", data);
      await qc.invalidateQueries({ queryKey: ["admin_users"] });

      alert(mode === "hard" ? "User deleted ✅" : "User access removed ✅");
    } catch (e) {
      console.error("removeUser error:", e);
      alert(safeMessage(e));
    } finally {
      setBusyKey("");
    }
  }

  // --- Access guard ---
  const adminOk = typeof isAdmin === "function" ? isAdmin() : Boolean(isAdmin);
  if (!adminOk) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-center text-slate-500">You don't have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team</h1>
          <p className="text-slate-500 mt-1">{users.length} team members</p>
        </div>
      </div>

      {/* Workspaces warning (you currently have 500s) */}
      {workspacesErr && (
        <div className="mb-6 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4">
          <div className="font-medium">Workspaces failed to load.</div>
          <div className="mt-1 opacity-90">{safeMessage(workspacesErr)}</div>
          <div className="mt-3">
            <Button variant="outline" onClick={() => refetchWorkspaces()} disabled={loadingWorkspaces || anyBusy}>
              Retry loading workspaces
            </Button>
          </div>
        </div>
      )}

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
                Sends invite email, sets global role, and optionally assigns a workspace membership immediately.
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
                disabled={busy("invite")}
              />
            </div>

            <div>
              <p className="text-sm text-slate-600 mb-1">Global role</p>
              <select
                className="w-full h-10 border rounded-md px-3"
                value={inviteGlobalRole}
                onChange={(e) => setInviteGlobalRole(e.target.value)}
                disabled={busy("invite")}
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
                disabled={busy("invite") || Boolean(workspacesErr) || loadingWorkspaces}
                title={workspacesErr ? "Workspaces failed to load" : "Workspace (optional)"}
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
                disabled={busy("invite") || !inviteWorkspaceId}
                title={!inviteWorkspaceId ? "Select a workspace first" : "Workspace role"}
              >
                <option value="client_viewer">client_viewer</option>
                <option value="client_approver">client_approver</option>
                <option value="account_manager">account_manager</option>
              </select>
            </div>

            <div className="md:col-span-3" />

            <div className="flex items-end">
              <Button disabled={busy("invite") || !inviteEmail.trim()} onClick={inviteUser} className="w-full">
                {busy("invite") ? "Working..." : "Invite"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team members..." className="pl-10 bg-white" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-2 gap-4 mb-8">
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
          Failed to load users.
          <div className="mt-2 text-slate-700">Error: {safeMessage(usersErr)}</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/60 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filteredUsers.map((u) => {
              const isSelf = user?.id && u.id === user.id;

              return (
                <div key={u.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <Avatar className="w-12 h-12">
                        <AvatarFallback className="bg-gradient-to-br from-violet-500 to-indigo-500 text-white font-medium">
                          {getInitials(u.full_name || u.email)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-slate-900 truncate">{u.full_name || "No name"}</h3>
                          <RoleBadge role={u.role} />
                          {isSelf && <Badge className="bg-emerald-100 text-emerald-700">You</Badge>}
                        </div>
                        <p className="text-sm text-slate-500 truncate">{u.email || ""}</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {/* Global role */}
                      <select
                        className="h-9 border rounded-md px-2 text-sm"
                        value={u.role}
                        onChange={(e) => updateGlobalRole(u.id, e.target.value)}
                        disabled={anyBusy || isSelf}
                        title={isSelf ? "You cannot change your own role here" : "Global role"}
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>

                      {/* Workspace role (per user) */}
<select
  className="h-9 border rounded-md px-2 text-sm"
  value={perUserWorkspaceRole[u.id] ?? "account_manager"}
  onChange={(e) =>
    setPerUserWorkspaceRole((prev) => ({ ...prev, [u.id]: e.target.value }))
  }
  disabled={anyBusy}
  title="Workspace role"
>
  <option value="account_manager">account_manager</option>
  <option value="client_viewer">client_viewer</option>
  <option value="client_approver">client_approver</option>
</select>

{/* Add to workspace */}
<select
  className="h-9 border rounded-md px-2 text-sm"
  defaultValue=""
  onChange={(e) => {
    const wsId = e.target.value;
    if (!wsId) return;

    const role = perUserWorkspaceRole[u.id] ?? "account_manager";
    assignToWorkspace(u.id, wsId, role);

    e.target.value = "";
  }}
  disabled={anyBusy || Boolean(workspacesErr) || loadingWorkspaces}
  title={workspacesErr ? "Workspaces failed to load" : "Assign to workspace"}
>
  <option value="">Add to workspace…</option>
  {workspaces.map((w) => (
    <option key={w.id} value={w.id}>
      {w.name}
    </option>
  ))}
</select>

                      {/* Soft remove */}
                      <Button
                        variant="outline"
                        disabled={anyBusy || isSelf}
                        onClick={() => removeUser(u.id, "soft")}
                        className="gap-2"
                        title="Remove from all workspaces (soft remove)"
                      >
                        <UserX className="w-4 h-4" />
                        Remove access
                      </Button>

                      {/* Hard delete */}
                      <Button
                        variant="destructive"
                        disabled={anyBusy || isSelf}
                        onClick={() => removeUser(u.id, "hard")}
                        className="gap-2"
                        title="Permanently delete user"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredUsers.length === 0 && <div className="p-8 text-center text-slate-500">No team members match your search.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

