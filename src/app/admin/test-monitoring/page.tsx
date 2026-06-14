'use client';
import { useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';

export default function TestMonitoringPage() {
  const [result, setResult] = useState<string>('');

  async function triggerError() {
    setResult('Triggering...');
    const sb = createClient();
    const r = await sb.from('this_table_does_not_exist_xyz').select('*');
    setResult(JSON.stringify(r, null, 2));
  }

  return (
    <AdminLayout>
      <h1 className="text-xl font-bold mb-4">Monitoring Test</h1>
      <p className="text-sm text-gray-600 mb-4">
        Clicking the button below triggers a deliberately failing query
        against a nonexistent table. The monitoring wrapper should catch
        the error and post to Slack.
      </p>
      <button
        onClick={triggerError}
        className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600"
      >
        Trigger test error
      </button>
      {result && (
        <pre className="mt-6 p-4 bg-gray-100 rounded text-xs overflow-auto">{result}</pre>
      )}
    </AdminLayout>
  );
}
