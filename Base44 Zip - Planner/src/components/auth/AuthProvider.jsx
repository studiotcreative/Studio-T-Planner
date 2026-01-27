// src/components/auth/AuthProvider.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [workspaceMemberships, setWorkspaceMemberships] = useState([]);
  const [assignedAccounts, setAssignedAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadUserData = async () => {
    setLoading(true);

    // 1) Auth user (Supabase)
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const authUser = userRes?.user ?? null;

    if (userErr) console.error("[AUTH] getUser error:", userErr);

    if (!authUser) {
      // Not logged in
      setUser(null);
      setUserRole(null);
      setWorkspaceMemberships([]);
      setAssignedAccounts([]);
      setLoading(false);
      return;
    }

    setUser(authUser);

    // 2) Global role from profiles
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", authUser.id)
      .single();

    if (profileErr) console.error("[AUTH] profile error:", profileErr);

    // Expect: profiles.role is 'admin' for global admins, otherwise 'user'
    const globalRole = profile?.role ?? "user";

    // 3) Workspace memberships (workspace-level roles)
    const { data: memberships, error: memErr } = await supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", authUser.id);

    if (memErr) console.error("[AUTH] memberships error:", memErr);

    const safeMemberships = memberships ?? [];
    setWorkspaceMemberships(safeMemberships);

    // 4) Social accounts you can see (basic version)
    // NOTE: If RLS blocks list-all, we can switch to "accounts in your workspaces only"
    const { data: accounts, error: accErr } = await supabase
      .from("social_accounts")
      .select("*");

    if (accErr) console.error("[AUTH] social_accounts error:", accErr);

    const safeAccounts = accounts ?? [];
    setAssignedAccounts(safeAccounts);

    // 5) Effective app role (matches your app's expectations)
    // Admin: global admin
    // Account manager: any workspace_members role 'account_manager'
    // Client approver/viewer: based on workspace role
    if (globalRole === "admin") {
      setUserRole("admin");
    } else if (safeMemberships.some((m) => m.role === "account_manager")) {
      setUserRole("account_manager");
    } else if (safeMemberships.some((m) => m.role === "client_approver")) {
      setUserRole("client_approver");
    } else if (safeMemberships.some((m) => m.role === "client_viewer")) {
      setUserRole("client_viewer");
    } else {
      setUserRole("viewer");
    }

    setLoading(false);
  };

  useEffect(() => {
    // Initial load
    loadUserData();

    // Keep state in sync on login/logout/token refresh
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadUserData();
    });

    return () => {
      sub?.subscription?.unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Role helpers (same API shape as your current file)
  const isAdmin = () => userRole === "admin";
  const isAccountManager = () => userRole === "account_manager" || userRole === "admin";
  const isClient = () => userRole === "client_viewer" || userRole === "client_approver";
  const canApprove = () => userRole === "client_approver" || userRole === "admin";

  const getClientWorkspaceId = () => {
    if (isAdmin()) return null;
    const clientMembership = workspaceMemberships.find(
      (m) => m.role === "client_viewer" || m.role === "client_approver"
    );
    return clientMembership?.workspace_id ?? null;
  };

  const hasAccessToWorkspace = (workspaceId) => {
    if (isAdmin()) return true;
    return workspaceMemberships.some((m) => m.workspace_id === workspaceId);
  };

  const hasAccessToAccount = (accountId) => {
    if (isAdmin()) return true;

    if (isClient()) {
      // Clients are restricted by workspace in the UI + RLS server-side.
      return true;
    }

    // For now, assignedAccounts = readable accounts (until we add stricter assignment logic)
    return assignedAccounts.some((a) => a.id === accountId);
  };

  const value = {
    user,
    userRole,
    workspaceMemberships,
    assignedAccounts,
    loading,
    isAdmin,
    isAccountManager,
    isClient,
    canApprove,
    getClientWorkspaceId,
    hasAccessToWorkspace,
    hasAccessToAccount,
    refresh: loadUserData,
    // Optional convenience:
    signOut: async () => {
      await supabase.auth.signOut();
      window.location.href = "/";
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

