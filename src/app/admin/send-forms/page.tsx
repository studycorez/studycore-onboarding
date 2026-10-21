'use client';

import { useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Copy, Check, ExternalLink } from 'lucide-react';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.studycore.net';
const TUTOR_FORM_URL = `${APP_URL}/tutor-form`;

export default function SendFormsPage() {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(TUTOR_FORM_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tutor Form Link</h1>
        <p className="text-sm text-gray-500 mt-1">
          Share this single link with any tutor. They&apos;ll enter their info and availability directly.
        </p>
      </div>

      <div className="card p-6 max-w-xl">
        <p className="text-sm font-semibold text-gray-900 mb-3">Tutor Onboarding Form</p>

        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4">
          <span className="text-sm text-gray-700 font-mono flex-1 truncate">{TUTOR_FORM_URL}</span>
          <a
            href={TUTOR_FORM_URL}
            target="_blank"
            rel="noreferrer"
            className="text-navy-400 hover:text-navy-600 flex-shrink-0"
            title="Open form"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        <button
          onClick={copyLink}
          className="btn-primary w-full justify-center"
        >
          {copied
            ? <><Check className="w-4 h-4 text-green-300" /> Copied!</>
            : <><Copy className="w-4 h-4" /> Copy Link</>}
        </button>

        <p className="text-xs text-gray-400 mt-4">
          Tutors can use this link to set their name, email, subjects, rate, and weekly availability. Submitting will create or update their profile in StudyCore.
        </p>
      </div>
    </AdminLayout>
  );
}
