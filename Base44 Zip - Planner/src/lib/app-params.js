// src/lib/app-params.js
// Legacy Base44 compatibility layer.
//
// This project is migrating away from Base44 → Supabase.
// Some older files may still import `appParams`. This file prevents runtime/build crashes
// while you remove remaining Base44 references.
//
// IMPORTANT: Do not add new code that depends on appParams.

const isBrowser = typeof window !== "undefined";

const safeGet = (key) => {
  if (!isBrowser) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (key, value) => {
  if (!isBrowser) return;
  try {
    if (value === undefined || value === null) return;
    window.localStorage.setItem(key, String(value));
  } catch {
    // ignore
  }
};

const safeRemove = (key) => {
  if (!isBrowser) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

// If any old Base44 "clear token" flags exist, remove them safely
if (isBrowser) {
  const urlParams = new URLSearchParams(window.location.search);
  const clear = urlParams.get("clear_access_token");
  if (clear === "true") {
    safeRemove("base44_access_token");
    safeRemove("token");
    safeRemove("base44_token");
  }
}

// Export a minimal object so any legacy imports won't crash.
// Keep keys present, but values are always null unless something stored them previously.
export const appParams = {
  appId: safeGet("base44_app_id"),
  token: safeGet("base44_access_token") || safeGet("token"),
  fromUrl: isBrowser ? window.location.href : null,
  functionsVersion: safeGet("base44_functions_version"),
  appBaseUrl: safeGet("base44_app_base_url"),
};
