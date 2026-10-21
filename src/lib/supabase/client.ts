'use client';

import { createBrowserClient } from '@supabase/ssr';
import { monitoringFetch } from './error-monitoring';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    {
      global: { fetch: monitoringFetch() },
    }
  );
}
