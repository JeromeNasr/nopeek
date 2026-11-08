import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True when Supabase credentials are present. Without them the app runs local-only. */
export const isCloudConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isCloudConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null
