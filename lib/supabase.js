import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jmxxgscnzufehknzrotx.supabase.co"; // e.g. https://xxxx.supabase.co
const SUPABASE_ANON_KEY = "sb_publishable_xqZ2gz4OCOx36ko-pKzbMQ_OByr9d8P";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
