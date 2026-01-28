// src/pages/Team.jsx
import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { Search, Shield, Users, Briefcase } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PlatformIcon from "@/components/ui/PlatformIcon";

export default function Team() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");

  const { data: users = [], isLoading: loadingUsers } = useQuery({
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

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_accounts")
        .select("id, platform, handle, assigned_manager_email")
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const { data, error } = await supabase.from("workspaces").select("id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredUsers = users.filter((u) => {
    const name = (u.full_name ?? "").toLowerCase();
    const email = (u.email ?? "").toLowerCase();
    const q = search.toLowerCase();
    return name.includes(q) || email.includes(q);
  });

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
                <p className="text-2xl font-bold text-slate-900">
                  {accountManagerCount}
                </p>
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
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/60 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filteredUsers.map((user) => {
              const assignedAccounts = getAssignedAccounts(user.email);

              return (
                <div key={user.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar className="w-12 h-12">
                        <AvatarFallback className="bg-gradient-to-br from-violet-500 to-indigo-500 text-white font-medium">
                          {getInitials(user.full_name || user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-slate-900">
                            {user.full_name || "No name"}
                          </h3>
                          {getRoleBadge(user.role)}
                        </div>
                        <p className="text-sm text-slate-500">{user.email || ""}</p>
                      </div>
                    </div>

                    {assignedAccounts.length > 0 && (
                      <div className="hidden md:flex items-center gap-2">
                        <span className="text-sm text-slate-500 mr-2">
                          Assigned accounts:
                        </span>
                        {assignedAccounts.slice(0, 3).map((account) => (
                          <div
                            key={account.id}
                            className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-full text-xs"
                          >
                            <PlatformIcon platform={account.platform} size="sm" />
                            @{account.handle}
                          </div>
                        ))}
                        {assignedAccounts.length > 3 && (
                          <span className="text-xs text-slate-500">
                            +{assignedAccounts.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Mobile: Assigned accounts */}
                  {assignedAccounts.length > 0 && (
                    <div className="md:hidden flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
                      {assignedAccounts.map((account) => (
                        <div
                          key={account.id}
                          className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-full text-xs"
                        >
                          <PlatformIcon platform={account.platform} size="sm" />
                          @{account.handle}
                        </div>
                      ))}
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
