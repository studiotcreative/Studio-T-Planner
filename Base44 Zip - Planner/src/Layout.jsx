// src/Layout.jsx
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
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
  const { user, userRole, loading, isAdmin, isClient, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const navItems = useMemo(() => {
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
        { label: "Calendar", icon: Calendar, href: createPageUrl("Calendar") },
        { label: "Workspaces", icon: Building2, href: createPageUrl("Workspaces") }
      );
    }

    return items;
  }, [isAdmin, isClient]);

  const initials =
    user?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase() ||
    user?.email?.[0]?.toUpperCase() ||
    "U";

  const NavLinks = ({ variant = "desktop" }) => (
    <nav className={variant === "mobile" ? "flex flex-col gap-1" : "flex flex-col lg:flex-row gap-1 lg:gap-0.5"}>
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

  const homeHref = createPageUrl(isClient() ? "ClientCalendar" : "Dashboard");
  const displayName = user?.full_name || user?.email || "User";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
        <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left */}
            <div className="flex items-center gap-3 sm:gap-6">
              <Link to={homeHref} className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-lg text-slate-900 hidden sm:block">
                  Studio T
                </span>
              </Link>

              {/* Desktop nav */}
              <div className="hidden lg:block">
                <NavLinks variant="desktop" />
              </div>
            </div>

            {/* Right */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Role pill (hide on small phones) */}
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full">
                <span className="text-xs font-medium text-slate-600 capitalize">
                  {String(userRole || "").replace("_", " ") || "unknown"}
                </span>
              </div>

              {/* User menu (tight on mobile) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex items-center gap-2 px-2 max-w-[55vw] sm:max-w-none"
                  >
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarFallback className="bg-gradient-to-br from-violet-500 to-indigo-500 text-white text-xs font-medium">
                        {initials}
                      </AvatarFallback>
                    </Avatar>

                    {/* Prevent header overflow on mobile */}
                    <span className="hidden sm:block text-sm font-medium text-slate-700 truncate">
                      {displayName}
                    </span>

                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {user?.full_name || "User"}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden"
                    aria-label="Open navigation"
                  >
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>

                {/* Use left drawer (more natural) + add header + safe scrolling */}
                <SheetContent
                  side="left"
                  className="w-[82vw] max-w-[320px] p-0"
                >
                  <div className="h-full flex flex-col">
                    <div className="px-4 py-4 border-b border-slate-200/60">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
                          <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {user?.full_name || "User"}
                          </p>
                          <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                        </div>
                      </div>

                      <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full">
                        <span className="text-xs font-medium text-slate-600 capitalize">
                          {String(userRole || "").replace("_", " ") || "unknown"}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-3 py-3">
                      <NavLinks variant="mobile" />
                    </div>

                    <div className="p-3 border-t border-slate-200/60">
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-red-600 hover:text-red-600"
                        onClick={handleSignOut}
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        Sign out
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      {/* Give pages consistent padding on mobile (prevents edge-to-edge ugliness) */}
      <main className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 py-4">
        {children}
      </main>
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <LayoutContent currentPageName={currentPageName}>
      {children}
    </LayoutContent>
  );
}

