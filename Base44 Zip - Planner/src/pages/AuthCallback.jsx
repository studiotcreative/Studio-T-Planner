import React, { useEffect } from "react";
import { supabase } from "@/api/supabaseClient";

export default function AuthCallback() {
  useEffect(() => {
    const run = async () => {
      // This finalizes the magic-link sign-in and persists the session
      await supabase.auth.getSession();
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
