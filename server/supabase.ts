import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Server-side Supabase client using the service role key (bypasses RLS).
 *  null when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. */
export const supabase =
  url && key
    ? createClient(url, key, { auth: { persistSession: false } })
    : null;
