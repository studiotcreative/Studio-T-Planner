import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const sendLink = async (e) => {
    e.preventDefault();
    setError("");

    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (err) {
      setError(err.message);
      return;
    }

    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full bg-white border rounded-xl p-6">
        <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
        <p className="text-sm text-slate-600 mt-2">
          We’ll email you a magic link to sign in.
        </p>

        <form onSubmit={sendLink} className="mt-4 space-y-3">
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />

          <button
            className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 text-sm font-medium"
            type="submit"
            disabled={!email}
          >
            Send magic link
          </button>

          {sent && (
            <p className="text-sm text-green-700">
              Link sent. Check your email and click it to finish signing in.
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </div>
    </div>
  );
}
