// --- SINGLETON SUPABASE CLIENT (ESM SAFE) ---
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load .env if not yet loaded
const envPath = path.resolve(process.cwd(), ".env");
const envLocalPath = path.resolve(process.cwd(), ".env.local");

if (!process.env.SUPABASE_URL && fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log("🌍 Loaded .env from:", envPath);
}
if (!process.env.SUPABASE_URL && fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
  console.log("🌍 Loaded .env.local from:", envLocalPath);
}

// Reuse global client if exists
let supabase;
if (globalThis.supabase) {
  console.log("♻️ Using existing global Supabase client");
  supabase = globalThis.supabase;
} else {
  const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
  const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Missing Supabase credentials.");
    throw new Error("Supabase credentials missing in supabaseClient.js");
  }

  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  globalThis.supabase = supabase;
  console.log("✅ Supabase client initialized (singleton mode)");
}

export default supabase;

// --- 🔍 Supabase connection test utility ---
export async function testSupabaseConnection() {
  try {
    const { data, error } = await supabase.from("restaurants").select("id").limit(1);
    if (error) throw error;
    console.log("✅ Supabase connection test passed");
    return true;
  } catch (err) {
    console.error("❌ Supabase connection test failed:", err.message);
    return false;
  }
}
