// These are intentionally browser-safe Supabase values, not secrets.
// Environment variables override them when a deployment prefers explicit config.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://nowlwprtcnieihelqjoa.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_487zTc09VarME-Fgf6EYig__47s_JTp";
