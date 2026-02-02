import React, { useEffect } from "react";
import { supabase } from "@/api/supabaseClient";

export default function AuthCallback() {
  useEffect(() => {
    const run = async () => {
      const url = new URL(window.location.href);

      // Handle PKCE code exchange if present
      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("exchangeCodeForSession error:", error);
          window.location.replace("/login");
          return;
        }
      }

      // Ensure we have a session after callback
      const { data } = await supabase.auth.getSession();
      const session = data?.session ?? null;

      if (!session?.user) {
        window.location.replace("/login");
        return;
      }

      // Identify invite/recovery type
      const typeFromQuery = url.searchParams.get("type");
      const typeFromHash = new URLSearchParams(url.hash.replace("#", "")).get("type");
      const type = typeFromQuery || typeFromHash;

      // Invite / recovery always go to Set Password
      if (type === "invite" || type === "recovery") {
        window.location.replace("/set-password");
        return;
      }

      // Default landing
      window.location.replace("/");
    };

    run();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="bg-white border rounded-xl p-6 text-sm text-slate-700">
        Finishing sign-in…
      </div>
    </div>
  );
}
