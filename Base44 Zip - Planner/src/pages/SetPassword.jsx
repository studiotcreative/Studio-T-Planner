import React, { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/components/auth/AuthProvider";

export default function SetPassword() {
  const { user, profile, loading, mustSetPassword } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // If user is logged in and doesn't need password setup, don't allow this page
  useEffect(() => {
    if (!loading && user && !mustSetPassword) {
      window.location.replace("/");
    }
  }, [loading, user, mustSetPassword]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!user) {
      setError("Invalid or expired invite. Please request a new invite.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);

    // 1) Set password
    const { error: passErr } = await supabase.auth.updateUser({ password });
    if (passErr) {
      setError(passErr.message);
      setSaving(false);
      return;
    }

    // 2) Clear must_set_password
    const { error: flagErr } = await supabase
      .from("profiles")
      .update({ must_set_password: false })
      .eq("id", user.id);

    if (flagErr) {
      setError(flagErr.message);
      setSaving(false);
      return;
    }

    // 3) Force normal login
    await supabase.auth.signOut();
    window.location.replace("/login");
  };

  // Loading / no user UI
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white border rounded-xl p-6 text-sm text-slate-700">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md bg-white border rounded-xl p-6">
        <h1 className="text-xl font-semibold">Create your password</h1>
        <p className="text-sm text-slate-600 mt-1">
          {profile?.email ? `Account: ${profile.email}` : "Set a password to finish activating your account."}
        </p>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            type="password"
            placeholder="New password"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Confirm password"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />

          <button
            disabled={saving}
            className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save password"}
          </button>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </div>
    </div>
  );
}

