'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { BookOpen, Loader2 } from 'lucide-react';

export default function ParentImpersonatePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) { setError('Missing token.'); return; }

    fetch('/api/parent-portal/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async res => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.error ?? 'Failed to start impersonation session.');
          return;
        }
        localStorage.setItem('adminPreview', '1');
        router.replace('/parent-portal/dashboard');
      })
      .catch(() => setError('Network error. Please try again.'));
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card p-8 max-w-sm w-full text-center">
          <p className="text-red-600 font-medium">{error}</p>
          <p className="text-gray-500 text-sm mt-2">Close this tab and try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 bg-navy-700 rounded-xl flex items-center justify-center mx-auto mb-4">
          <BookOpen className="w-6 h-6 text-white" />
        </div>
        <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
        <p className="text-gray-500 text-sm mt-3">Starting admin preview…</p>
      </div>
    </div>
  );
}
