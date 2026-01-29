// src/App.jsx
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { queryClientInstance } from "@/lib/query-client";
import { pagesConfig } from "./pages.config";
import PageNotFound from "./lib/PageNotFound";

// ✅ Use Supabase AuthProvider + useAuth
import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";

// (Optional) Keep disabled if you’re still migrating it
// import NavigationTracker from "@/lib/NavigationTracker";

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) =>
  Layout ? <Layout currentPageName={currentPageName}>{children}</Layout> : <>{children}</>;

function LoginPlaceholder() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full bg-white border rounded-xl p-6">
        <h1 className="text-xl font-semibold text-slate-900">Not signed in</h1>
        <p className="text-sm text-slate-600 mt-2">
          Supabase session is missing. Next step is to add a real login screen (magic link or password)
          and an auth callback route so the session is saved.
        </p>
      </div>
    </div>
  );
}

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

  // If no user session, show placeholder for now
  if (!user) return <LoginPlaceholder />;

  return (
    <Routes>
      <Route
        path="/"
        element={
          <LayoutWrapper currentPageName={mainPageKey}>
            <MainPage />
          </LayoutWrapper>
        }
      />

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

