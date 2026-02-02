// src/components/auth/AuthProvider.jsx
console.log("AUTH_PROVIDER_VERSION = 2026-02-02");

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/api/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [workspaceMemberships, setWorkspaceMemberships] = useState([]);
  const [assignedAccounts, setAssignedAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadingRef = useRef(false);

  const loadUserData = async (session) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    try {
      const authUser = session?.user ?? null;

      if (!authUser) {
        setUser(null);
        setUserRole(null);
        setWorkspaceMemberships([]);
        setAssignedAccounts([]);
        return;
      }

      // 1) Profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", authUser.id)
        .maybeSingle();

      const globalRole = profile?.role ?? "user";

      setUser({
        ...authUser,
        full_name:
          profile?.full_name ??
          authUser.user_metadata?.full_name ??
          authUser.email,
      });

      // 2) Workspace memberships
      const { data: memberships } = await supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", authUser.id);

      const safeMemberships = memberships ?? [];
      setWorkspaceMemberships(safeMemberships);

      // 3) Social accounts
      let accounts = [];

      if (globalRole === "admin") {
        const { data } = await supabase.from("social_accounts").select("*");
        accounts = data ?? [];
      } else {
        const workspaceIds = safeMemberships.map((m) => m.workspace_id);
        if (workspaceIds.length > 0) {
          const { data } = await supabase
            .from("social_accounts")
            .select("*")
            .in("workspace_id", workspaceIds);
          accounts = data ?? [];
        }
      }

      setAssignedAccounts(accounts);

      // 4) Effective role
      if (globalRole === "admin") setUserRole("admin");
      else if (safeMemberships.some((m) => m.role === "account_manager")) setUserRole("account_manager");
      else if (safeMemberships.some((m) => m.role === "client_approver")) setUserRole("client_approver");
      else if (safeMemberships.some((m) => m.role === "client_viewer")) setUserRole("client_viewer");
      else setUserRole("viewer");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial load
    supabase.auth.getSession().then(({ data }) => {
      loadUserData(data?.session ?? null);
    });

    // React to auth changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      loadUserData(session);
    });

    return () => {
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const isAdmin = () => userRole === "admin";
  const isAccountManager = () => isAdmin() || userRole === "account_manager";
  const isClient = () => userRole === "client_viewer" || userRole === "client_approver";
  const canApprove = () => isAdmin() || userRole === "client_approver";

  const signOut = async () => {
    await supabase.auth.signOut();
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
    signOut,
    refresh: () =>
      supabase.auth.getSession().then(({ data }) =>
        loadUserData(data?.session ?? null)
      ),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}


