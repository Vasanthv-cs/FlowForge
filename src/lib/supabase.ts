import { createClient } from '@supabase/supabase-js';

// Environment variables for Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rnkaowxaaxdzumliicku.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJua2Fvd3hhYXhkenVtbGlpY2t1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzNDMxNzQsImV4cCI6MjExMDkxOTE3NH0.DNTszdSIdxHfTnGbskeQbE3CMBQWYbfK4d3-SbAbD2k';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('YOUR_PROJECT') &&
    supabaseAnonKey !== 'your-supabase-anon-key'
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
