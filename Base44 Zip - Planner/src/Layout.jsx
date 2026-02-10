// src/Layout.jsx
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import { supabase } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  LayoutGrid,
  Settings,
  Users,
  Building2,
  ChevronDown,
  Menu,
  LogOut,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/components/auth/AuthProvider";
import { Skeleton } from "@/components/ui/skeleton";

function LayoutContent({ children, currentPageName }) {
  const { user, userRole, loading, isAdmin, isAccountManager, isClient, signOut } = useAuth();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    () => localStorage.getItem("active_workspace_id") || "all"
  );

  // Workspaces fetch (enabled for any logged-in user)
  const { data: workspaces = [], error: workspacesErr } = useQuery({
    queryKey: ["workspaces", user?.id ?? "anon"],
    enabled: !loading && Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      window.location.href = "/login";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  const getNavItems = () => {
    const items = [];

    if (isAdmin()) {
      items.push(
        { label: "Dashboard", icon: LayoutGrid, href: createPageUrl("Dashboard") },
        { label: "Calendar", icon: Calendar, href: createPageUrl("Calendar") },
        { label: "Workspaces", icon: Building2, href: createPageUrl("Workspaces") },
        { label: "Team", icon: Users, href: createPageUrl("Team") },
        { label: "Settings", icon: Settings, href: createPageUrl("Settings") }
      );
    } else if (isClient()) {
      items.push(
        { label: "Calendar", icon: Calendar, href: createPageUrl("ClientCalendar") },
        { label: "Feed Preview", icon: LayoutGrid, href: createPageUrl("ClientFeed") }
      );
    } else {
      // account_manager (and any non-client non-admin internal user)
      items.push(
        { label: "Dashboard", icon: LayoutGrid, href: createPageUrl("Dashboard") },
        { label: "Calendar", icon: Calendar, href: createPageUrl("Calendar") }
      );
    }

    return items;
  };

  const navItems = getNavItems();

  const initials =
    user?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase() ||
    user?.email?.[0]?.toUpperCase() ||
    "U";

  const NavLinks = () => (
    <nav className="flex flex-col lg:flex-row gap-1 lg:gap-0.5">
      {navItems.map((item) => {
        const isActive = currentPageName === item.label.replace(" ", "");
        return (
          <Link
            key={item.label}
            to={item.href}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
              ${
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left */}
            <div className="flex items-center gap-8">
              <Link
                to={createPageUrl(isClient() ? "ClientCalendar" : "Dashboard")}
                className="flex items-center gap-2.5"
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-lg text-slate-900 hidden sm:block">
                  Studio T
                </span>
              </Link>

              <div className="hidden lg:block">
                <NavLinks />
              </div>
            </div>

            {/* Right (ONE container) */}
            <div className="flex items-center gap-3">
              {/* Workspace switcher */}
              {(isAdmin() || isAccountManager()) && !isClient() && (
                <select
                  className="hidden md:block h-9 border border-slate-200 rounded-md px-2 text-sm bg-white"
                  value={activeWorkspaceId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setActiveWorkspaceId(v);
                    localStorage.setItem("active_workspace_id", v);
                    window.dispatchEvent(new Event("active-workspace-changed"));
                  }}
                  title="Workspace"
                >
                  <option value="all">All Workspaces</option>
                  {(workspaces ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Role pill */}
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full">
                <span className="text-xs font-medium text-slate-600 capitalize">
                  {String(userRole || "").replace("_", " ") || "unknown"}
                </span>
              </div>

              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 px-2">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-gradient-to-br from-violet-500 to-indigo-500 text-white text-xs font-medium">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:block text-sm font-medium text-slate-700">
                      {user?.full_name || user?.email || "User"}
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium text-slate-900">
                      {user?.full_name || "User"}
                    </p>
                    <p className="text-xs text-slate-500">{user?.email}</p>
                  </div>
                  <DropdownMenuSeparator />

                  <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile menu */}
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-72">
                  <div className="mt-8">
                    <NavLinks />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          {/* Optional: tiny warning if workspaces fail (helps debug AM issues) */}
          {workspacesErr && !isClient() && (
            <div className="pb-3 text-xs text-amber-700">
              Workspaces failed to load.
            </div>
          )}
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  return <LayoutContent currentPageName={currentPageName}>{children}</LayoutContent>;
}

