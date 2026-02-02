import React, { useEffect } from "react";
import { supabase } from "@/api/supabaseClient";

export default function AuthCallback() {
  useEffect(() => {
    const run = async () => {
      const url = new URL(window.location.href);

      // 1) If PKCE code is present, exchange it for a session
      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          // If this fails, send to login (or show error UI)
          window.location.replace(`/login`);
          return;
        }
      } else {
        // 2) Otherwise rely on implicit hash/session parsing
        await supabase.auth.getSession();
      }

      // read invite/recovery type from query or hash
      const typeFromQuery = url.searchParams.get("type");
      const typeFromHash = new URLSearchParams(url.hash.replace("#", "")).get("type");
      const type = typeFromQuery || typeFromHash;

      if (type === "invite" || type === "recovery") {
        window.location.replace("/set-password");
        return;
      }

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
