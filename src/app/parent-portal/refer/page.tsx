'use client';

import { useEffect, useState } from 'react';
import { useParentAuth } from '@/hooks/useParentAuth';
import ParentPortalLayout from '@/components/parent-portal/ParentPortalLayout';
import { Copy, Check, Users, Loader2, Gift } from 'lucide-react';
import { format } from 'date-fns';

interface Referral {
  id: string;
  referred_name: string;
  referred_email: string | null;
  created_at: string;
}

export default function ReferPage() {
  const { parent, loading: authLoading } = useParentAuth();
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [referralCode, setReferralCode]   = useState<string | null>(null);
  const [referrals, setReferrals]         = useState<Referral[]>([]);
  const [generating, setGenerating]       = useState(false);
  const [copied, setCopied]               = useState(false);
  const [dataLoading, setDataLoading]     = useState(false);

  // Auto-select first student
  useEffect(() => {
    if (parent?.students.length && !selectedStudentId) {
      const first = parent.students[0];
      setSelectedStudentId(first.id);
      setReferralCode(first.referral_code);
    }
  }, [parent, selectedStudentId]);

  // Load referral stats when student changes
  useEffect(() => {
    if (!selectedStudentId) return;
    setDataLoading(true);
    fetch(`/api/parent-portal/referral?student_id=${selectedStudentId}`)
      .then(r => r.json())
      .then(data => {
        setReferralCode(data.referral_code ?? null);
        setReferrals(data.referrals ?? []);
        setDataLoading(false);
      });
  }, [selectedStudentId]);

  async function generateCode() {
    if (!selectedStudentId || generating) return;
    setGenerating(true);
    const res = await fetch('/api/parent-portal/referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: selectedStudentId }),
    });
    if (res.ok) {
      const data = await res.json();
      setReferralCode(data.referral_code);
    }
    setGenerating(false);
  }

  async function copyLink() {
    if (!referralCode) return;
    const url = `${window.location.origin}/referral/${referralCode}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const referralUrl = referralCode ? `${typeof window !== 'undefined' ? window.location.origin : ''}/referral/${referralCode}` : '';

  if (authLoading) {
    return (
      <ParentPortalLayout parent={null}>
        <div className="animate-pulse space-y-4 max-w-2xl">
          {[1, 2].map(i => <div key={i} className="h-32 card rounded-xl" />)}
        </div>
      </ParentPortalLayout>
    );
  }

  return (
    <ParentPortalLayout parent={parent}>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Refer a Friend</h1>
          <p className="text-gray-500 text-sm mt-1">Share StudyCore with families who could benefit</p>
        </div>

        {/* Student selector */}
        {(parent?.students.length ?? 0) > 1 && (
          <div className="flex gap-2">
            {parent!.students.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedStudentId(s.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  selectedStudentId === s.id
                    ? 'bg-navy-600 text-white border-navy-600'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Referral link card */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <Gift className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Your Referral Link</p>
              <p className="text-xs text-gray-500">Share this with any family who might benefit from StudyCore</p>
            </div>
          </div>

          {dataLoading ? (
            <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
          ) : referralCode ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <p className="flex-1 text-sm text-gray-700 font-mono truncate">{referralUrl}</p>
                <button
                  onClick={copyLink}
                  className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                    copied ? 'bg-green-100 text-green-700' : 'bg-navy-100 text-navy-700 hover:bg-navy-200'
                  }`}
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-gray-400">
                When someone fills out the form at your link, our team will reach out to them directly.
              </p>
            </div>
          ) : (
            <button
              onClick={generateCode}
              disabled={generating}
              className="btn-primary"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
              {generating ? 'Generating…' : 'Generate My Referral Link'}
            </button>
          )}
        </div>

        {/* Referrals list */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" />
            <h2 className="font-semibold text-gray-900 text-sm">
              Your Referrals {referrals.length > 0 ? `(${referrals.length})` : ''}
            </h2>
          </div>
          {referrals.length === 0 ? (
            <p className="px-6 py-8 text-sm text-gray-400 text-center">
              No referrals yet. Share your link to get started!
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {referrals.map(r => (
                <div key={r.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{r.referred_name}</p>
                    {r.referred_email && <p className="text-xs text-gray-400 mt-0.5">{r.referred_email}</p>}
                  </div>
                  <p className="text-xs text-gray-400 flex-shrink-0">
                    {format(new Date(r.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ParentPortalLayout>
  );
}
