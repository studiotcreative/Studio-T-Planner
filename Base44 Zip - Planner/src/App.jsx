// src/App.jsx
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
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
import SetPassword from "@/pages/SetPassword";

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) =>
  Layout ? <Layout currentPageName={currentPageName}>{children}</Layout> : <>{children}</>;

function AuthedRoutes() {
  const { user, loading, mustSetPassword } = useAuth();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  /**
   * ✅ ROUTE ALIASES WE SUPPORT
   * - /auth/callback
   * - /set-password  (our preferred)
   * - /setpassword   (Supabase invite sometimes uses this style depending on templates)
   * - /             (login when signed out)
   */

  // ✅ Not signed in: login lives at "/"
  if (!user) {
    return (
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Password pages are allowed even if session isn’t present yet */}
        <Route path="/set-password" element={<SetPassword />} />
        <Route path="/setpassword" element={<SetPassword />} />

        {/* Login entry */}
        <Route path="/" element={<Login />} />

        {/* Anything else while logged out → go to login */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // ✅ Signed in BUT must set password: force them to /set-password (no bypass)
  if (mustSetPassword) {
    return (
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/set-password" element={<SetPassword />} />
        <Route path="/setpassword" element={<SetPassword />} />
        <Route path="*" element={<Navigate to="/set-password" replace />} />
      </Routes>
    );
  }

  // ✅ Signed in: full app routes
  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/setpassword" element={<SetPassword />} />

      {/* If someone tries "/" while signed in, send them to the app home */}
      <Route path="/" element={<Navigate to={`/${mainPageKey ?? ""}`} replace />} />

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
          <AuthedRoutes />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

