// src/pages/Login.jsx
import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const signIn = async (e) => {
    e.preventDefault();
    setErr("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErr(error.message);
      return;
    }
    // App.jsx + AuthProvider will handle routing
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full bg-white border rounded-xl p-6">
        <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>

        <form onSubmit={signIn} className="mt-4 space-y-3">
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />

          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />

          <button
            className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 text-sm font-medium"
            type="submit"
          >
            Sign in
          </button>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </form>
      </div>
    </div>
  );
}

