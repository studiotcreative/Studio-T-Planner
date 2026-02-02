import React, { useEffect } from "react";
import { supabase } from "@/api/supabaseClient";

export default function AuthCallback() {
  useEffect(() => {
    const run = async () => {
      // finalize magic-link session
      await supabase.auth.getSession();

      // If this callback came from an INVITE or RECOVERY link, force Set Password
      const url = new URL(window.location.href);

      // Supabase magic links often include type in query or hash.
      const typeFromQuery = url.searchParams.get("type");
      const typeFromHash = new URLSearchParams(url.hash.replace("#", "")).get("type");
      const type = typeFromQuery || typeFromHash;

      if (type === "invite" || type === "recovery") {
        window.location.href = "/set-password";
        return;
      }

      window.location.href = "/";
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
