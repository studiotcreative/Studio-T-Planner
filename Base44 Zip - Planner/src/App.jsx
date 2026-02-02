// src/App.jsx
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { queryClientInstance } from "@/lib/query-client";
import { pagesConfig } from "./pages.config";
import PageNotFound from "./lib/PageNotFound";

// ✅ Supabase auth
import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";

// ✅ Auth pages
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";

// ✅ NEW: Set Password page (you will create this file)
import SetPassword from "@/pages/SetPassword";

// (Optional) Keep disabled if you’re still migrating it
// import NavigationTracker from "@/lib/NavigationTracker";

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) =>
  Layout ? <Layout currentPageName={currentPageName}>{children}</Layout> : <>{children}</>;

function AuthedRoutes() {
  const { user, loading } = useAuth();

  // Loading while Supabase session is being checked
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  /**
   * ✅ If NOT signed in:
   * - /login shows login form
   * - /auth/callback finishes magic-link login + saves session
   * - anything else routes to Login
   */
  if (!user) {
  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Login />} />
    </Routes>
  );
}

  /**
   * ✅ Signed in:
   * - /set-password is available (for invite/recovery flows)
   * - normal app routes load
   */
  return (
    <Routes>
      {/* Auth routes (safe to keep even when signed in) */}
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/set-password" element={<SetPassword />} />

      {/* Main page */}
      <Route
        path="/"
        element={
          <LayoutWrapper currentPageName={mainPageKey}>
            <MainPage />
          </LayoutWrapper>
        }
      />

      {/* Dynamic pages from config */}
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          {/* <NavigationTracker /> */}
          <AuthedRoutes />
        </Router>

        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

