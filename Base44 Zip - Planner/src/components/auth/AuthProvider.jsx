// src/components/auth/AuthProvider.jsx
console.log("AUTH_PROVIDER_VERSION = 2026-02-02-PHASE2");

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/api/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  // ✅ Keep full profile so we can enforce must_set_password + role gating
  const [profile, setProfile] = useState(null);

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
        setProfile(null);
        setUserRole(null);
        setWorkspaceMemberships([]);
        setAssignedAccounts([]);
        return;
      }

      // 1) Profile (SOURCE OF TRUTH)
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, email, full_name, role, must_set_password")
        .eq("id", authUser.id)
        .maybeSingle();

      if (profErr) console.error("Profile fetch error:", profErr);

      const globalRole = prof?.role ?? "user";
      const mustSetPasswordFlag = !!prof?.must_set_password;

      // Save profile in context (SetPassword + guards use this)
      setProfile(
        prof ?? {
          id: authUser.id,
          email: authUser.email ?? null,
          full_name: authUser.user_metadata?.full_name ?? authUser.email ?? "",
          role: globalRole,
          must_set_password: mustSetPasswordFlag,
        }
      );

      // Save user for UI
      setUser({
        ...authUser,
        full_name: prof?.full_name ?? authUser.user_metadata?.full_name ?? authUser.email,
      });

      // 2) Workspace memberships
      const { data: memberships, error: memErr } = await supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", authUser.id);

      if (memErr) console.error("Membership fetch error:", memErr);

      const safeMemberships = memberships ?? [];
      setWorkspaceMemberships(safeMemberships);

      // 3) Social accounts (read-only baseline)
      let accounts = [];
      if (globalRole === "admin") {
        const { data, error } = await supabase.from("social_accounts").select("*");
        if (error) console.error("Social accounts fetch error:", error);
        accounts = data ?? [];
      } else {
        const workspaceIds = safeMemberships.map((m) => m.workspace_id);
        if (workspaceIds.length > 0) {
          const { data, error } = await supabase
            .from("social_accounts")
            .select("*")
            .in("workspace_id", workspaceIds);
          if (error) console.error("Social accounts fetch error:", error);
          accounts = data ?? [];
        }
      }
      setAssignedAccounts(accounts);

      // 4) Effective UI role (Base44-style gating)
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

  // ✅ Invite gating flag (used by App.jsx guard)
  const mustSetPassword = !!profile?.must_set_password;

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setUserRole(null);
    setWorkspaceMemberships([]);
    setAssignedAccounts([]);
  };

  // ✅ Keep Layout.jsx compatible (it expects copyAccessToken)
  const copyAccessToken = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;

    try {
      await navigator.clipboard.writeText(token);
    } catch {
      const el = document.createElement("textarea");
      el.value = token;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
  };

  const value = {
    user,
    profile,
    mustSetPassword,

    userRole,
    workspaceMemberships,
    assignedAccounts,
    loading,

    isAdmin,
    isAccountManager,
    isClient,
    canApprove,

    signOut,
    copyAccessToken,

    refresh: () =>
      supabase.auth.getSession().then(({ data }) => loadUserData(data?.session ?? null)),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}



