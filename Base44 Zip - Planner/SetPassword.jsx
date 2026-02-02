import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";

export default function SetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();

    if (!password || password.length < 8) {
      alert("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      alert("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      alert("Password saved ✅ You can now log in with email + password.");
      window.location.href = "/";
    } catch (err) {
      console.error(err);
      alert(err?.message ?? "Failed to set password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md bg-white border rounded-xl p-6">
        <h1 className="text-lg font-semibold text-slate-900">Set your password</h1>
        <p className="text-sm text-slate-600 mt-1">
          This is a one-time setup so you can log in normally next time.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <div>
            <label className="text-sm text-slate-600">New password</label>
            <input
              className="w-full h-10 border rounded-md px-3 mt-1"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label className="text-sm text-slate-600">Confirm password</label>
            <input
              className="w-full h-10 border rounded-md px-3 mt-1"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full h-10 rounded-md bg-slate-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save password"}
          </button>
        </form>
      </div>
    </div>
  );
}
