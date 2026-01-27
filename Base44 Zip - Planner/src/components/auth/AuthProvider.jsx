import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/api/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [workspaceMemberships, setWorkspaceMemberships] = useState([]);
  const [assignedAccounts, setAssignedAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadUserData = useCallback(async () => {
    setLoading(true);

    try {
      // 1) Auth user (Supabase session)
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      const authUser = userRes?.user ?? null;

      if (userErr) console.error('[AUTH] getUser error:', userErr);

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

      // 2) Global role from profiles (admin/user)
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', authUser.id)
        .single();

      if (profileErr) console.error('[AUTH] profiles error:', profileErr);

      const isGlobalAdmin = (profile?.role ?? 'user') === 'admin';

      // 3) Workspace memberships
      const { data: memberships, error: memErr } = await supabase
        .from('workspace_members')
        .select('workspace_id, role')
        .eq('user_id', authUser.id);

      if (memErr) console.error('[AUTH] workspace_members error:', memErr);

      const safeMemberships = memberships ?? [];
      setWorkspaceMemberships(safeMemberships);

      // 4) Social accounts visibility
      // Admin: can see everything
      // Non-admin: try to get accounts assigned to them OR where they are a collaborator.
      let accounts = [];

      if (isGlobalAdmin) {
        const { data: all, error: accErr } = await supabase
          .from('social_accounts')
          .select('*');

        if (accErr) console.error('[AUTH] social_accounts (admin) error:', accErr);
        accounts = all ?? [];
      } else {
        const email = authUser.email;

        // A) assigned_manager_email == my email
        const { data: assigned, error: assignedErr } = await supabase
          .from('social_accounts')
          .select('*')
          .eq('assigned_manager_email', email);

        if (assignedErr) console.error('[AUTH] social_accounts assigned error:', assignedErr);

        // B) collaborator_emails contains my email (if collaborator_emails is a text[] column)
        const { data: collab, error: collabErr } = await supabase
          .from('social_accounts')
          .select('*')
          .contains('collaborator_emails', [email]);

        // If your collaborator_emails is NOT an array column, this may error — that’s okay; we’ll adjust.
        if (collabErr) console.error('[AUTH] social_accounts collaborator error:', collabErr);

        const map = new Map();
        (assigned ?? []).forEach(a => map.set(a.id, a));
        (collab ?? []).forEach(a => map.set(a.id, a));
        accounts = Array.from(map.values());
      }

      setAssignedAccounts(accounts);

      // 5) Determine effective app role (keep your same logic/labels)
      // Priority:
      // - global admin -> admin
      // - has assigned accounts -> account_manager
      // - workspace role client_approver/client_viewer -> client roles
      // - otherwise viewer
      if (isGlobalAdmin) {
        setUserRole('admin');
      } else if (accounts.length > 0) {
        setUserRole('account_manager');
      } else if (safeMemberships.some(m => m.role === 'client_approver')) {
        setUserRole('client_approver');
      } else if (safeMemberships.some(m => m.role === 'client_viewer')) {
        setUserRole('client_viewer');
      } else {
        setUserRole('viewer');
      }
    } catch (e) {
      console.error('[AUTH] unexpected error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + react to login/logout changes
  useEffect(() => {
    loadUserData();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadUserData();
    });

    return () => {
      sub?.subscription?.unsubscribe?.();
    };
  }, [loadUserData]);

  const isAdmin = () => userRole === 'admin';
  const isAccountManager = () => userRole === 'account_manager' || userRole === 'admin';
  const isClient = () => userRole === 'client_viewer' || userRole === 'client_approver';
  const canApprove = () => userRole === 'client_approver' || userRole === 'admin';

  const getClientWorkspaceId = () => {
    if (isAdmin()) return null;
    const clientMembership = workspaceMemberships.find(m =>
      m.role === 'client_viewer' || m.role === 'client_approver'
    );
    return clientMembership?.workspace_id;
  };

  const hasAccessToWorkspace = (workspaceId) => {
    if (isAdmin()) return true;
    return workspaceMemberships.some(m => m.workspace_id === workspaceId);
  };

  const hasAccessToAccount = (accountId) => {
    if (isAdmin()) return true;
    if (isClient()) return true; // access checked at workspace level in your UI
    return assignedAccounts.some(a => a.id === accountId);
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
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
