// src/components/auth/AuthProvider.jsx
console.log("AUTH_PROVIDER_VERSION = 2026-01-29-2");

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/api/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [workspaceMemberships, setWorkspaceMemberships] = useState([]);
  const [assignedAccounts, setAssignedAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Prevent overlapping loads
  const loadingRef = useRef(false);

  const loadUserData = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    setLoading(true);
    try {
      // 1) Auth session (more reliable than getUser for restore)
      const { data: sessionRes, error: sessionErr } = await supabase.auth.getSession();
      const session = sessionRes?.session ?? null;
      const authUser = session?.user ?? null;

      if (sessionErr) console.error("[AUTH] getSession error:", sessionErr);
      console.log("[AUTH] session user:", authUser?.email ?? null);

      if (!authUser) {
        setUser(null);
        setUserRole(null);
        setWorkspaceMemberships([]);
        setAssignedAccounts([]);
        return;
      }

      // 2) Profile role + name
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", authUser.id)
        .maybeSingle();

      if (profileErr) console.error("[AUTH] profile error:", profileErr);

      const globalRole = profile?.role ?? "user";

      const fullNameFromProfile = profile?.full_name ?? null;
      const fullNameFromAuth =
        authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? null;

      const appUser = {
        ...authUser,
        full_name: fullNameFromProfile ?? fullNameFromAuth ?? authUser.email,
      };

      setUser(appUser);

      // 3) Workspace memberships
      const { data: memberships, error: memErr } = await supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", authUser.id);

      if (memErr) console.error("[AUTH] memberships error:", memErr);

      const safeMemberships = memberships ?? [];
      setWorkspaceMemberships(safeMemberships);

      // 4) Social accounts
      let safeAccounts = [];

      if (globalRole === "admin") {
        const { data: accounts, error: accErr } = await supabase
          .from("social_accounts")
          .select("*");

        if (accErr) console.error("[AUTH] social_accounts error:", accErr);
        safeAccounts = accounts ?? [];
      } else {
        const workspaceIds = safeMemberships.map((m) => m.workspace_id);
        if (workspaceIds.length > 0) {
          const { data: accounts, error: accErr } = await supabase
            .from("social_accounts")
            .select("*")
            .in("workspace_id", workspaceIds);

          if (accErr) console.error("[AUTH] social_accounts error:", accErr);
          safeAccounts = accounts ?? [];
        } else {
          safeAccounts = [];
        }
      }

      setAssignedAccounts(safeAccounts);

      // 5) Effective app role
      if (globalRole === "admin") setUserRole("admin");
      else if (safeMemberships.some((m) => m.role === "account_manager")) setUserRole("account_manager");
      else if (safeMemberships.some((m) => m.role === "client_approver")) setUserRole("client_approver");
      else if (safeMemberships.some((m) => m.role === "client_viewer")) setUserRole("client_viewer");
      else setUserRole("viewer");
    } catch (e) {
      console.error("[AUTH] loadUserData unexpected error:", e);
      setUser(null);
      setUserRole(null);
      setWorkspaceMemberships([]);
      setAssignedAccounts([]);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    loadUserData();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadUserData();
    });

    return () => {
      sub?.subscription?.unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (isClient()) return true;
    return assignedAccounts.some((a) => a.id === accountId);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("[AUTH] signOut error:", error);

    setUser(null);
    setUserRole(null);
    setWorkspaceMemberships([]);
    setAssignedAccounts([]);
  };

  // ✅ NEW: copy a clean access token (for Edge Function tests)
  const copyAccessToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error("[AUTH] getSession error:", error);
      alert("Could not read session");
      return;
    }
    const token = data?.session?.access_token;
    if (!token) {
      alert("No access token found (not signed in?)");
      return;
    }
    await navigator.clipboard.writeText(token);
    alert("Access token copied ✅");
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
    signOut,
    copyAccessToken, // ✅ expose helper
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

