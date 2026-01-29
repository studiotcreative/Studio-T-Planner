// src/components/auth/AuthProvider.jsx
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/api/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [workspaceMemberships, setWorkspaceMemberships] = useState([]);
  const [assignedAccounts, setAssignedAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Prevent overlapping loads (auth events can fire multiple times quickly)
  const loadingRef = useRef(false);

  const loadUserData = async () => {
    // Skip if a load is already running
    if (loadingRef.current) return;
    loadingRef.current = true;

    setLoading(true);
    try {
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
        return;
      }

      // 2) Global role + profile info from profiles (also contains full_name)
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", authUser.id)
        .single();

      if (profileErr) console.error("[AUTH] profile error:", profileErr);

      const globalRole = profile?.role ?? "user";

      // ✅ FIX #1: normalize user object so UI can safely use user.full_name
      // Supabase auth user usually has name/full_name in user_metadata, not at top-level.
      const fullNameFromProfile = profile?.full_name ?? null;
      const fullNameFromAuth =
        authUser.user_metadata?.full_name ??
        authUser.user_metadata?.name ??
        null;

      const appUser = {
        ...authUser,
        full_name: fullNameFromProfile ?? fullNameFromAuth ?? authUser.email,
      };

      setUser(appUser);

      // 3) Workspace memberships (workspace-level roles)
      const { data: memberships, error: memErr } = await supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", authUser.id);

      if (memErr) console.error("[AUTH] memberships error:", memErr);

      const safeMemberships = memberships ?? [];
      setWorkspaceMemberships(safeMemberships);

      // 4) Social accounts you can see (RLS-safe)
      // ✅ FIX #2: avoid list-all for non-admins (often blocked by RLS)
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

      // 5) Effective app role (matches your app's expectations)
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
    } catch (e) {
      console.error("[AUTH] loadUserData unexpected error:", e);
      // Fail safe: keep app usable
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

    // assignedAccounts = readable accounts
    return assignedAccounts.some((a) => a.id === accountId);
  };

  // ✅ FIX #3: reliable logout (reset local state immediately)
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("[AUTH] signOut error:", error);

    // Reset local state so UI updates even if navigation/caching is weird
    setUser(null);
    setUserRole(null);
    setWorkspaceMemberships([]);
    setAssignedAccounts([]);
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

