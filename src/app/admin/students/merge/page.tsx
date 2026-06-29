'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import { Loader2, RefreshCw } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface StudentSummary {
  id: string;
  name: string;
  email: string | null;
  parent_email: string | null;
  purchased_hours: number | null;
  used_hours: number | null;
  sat_date: string | null;
  target_score: number | null;
  created_at: string;
}

interface DuplicateGroup {
  name: string;
  match_type: 'exact' | 'name_only';
  students: StudentSummary[];
}

interface FieldConflict {
  field: string;
  canonical_value: any;
  duplicate_value: any;
}

interface ContractConflict {
  tutor_id: string;
  tutor_name: string;
  canonical_contract: { id: string; signed_at: string; hourly_rate: number; status: string };
  duplicate_contract: { id: string; signed_at: string; hourly_rate: number; status: string };
  will_keep: 'canonical' | 'duplicate';
}

interface MergePreview {
  canonical: any;
  duplicate: any;
  field_conflicts: FieldConflict[];
  contract_conflicts: ContractConflict[];
  repoint_counts: Record<string, number>;
  hours_after_merge: { purchased: number; used: number };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MergePage() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection state per group: which student is canonical, which is duplicate
  const [selections, setSelections] = useState<Record<string, { canonical: string; duplicate: string }>>({});

  // Preview modal
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [previewGroupName, setPreviewGroupName] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // Field decisions for conflicts
  const [fieldDecisions, setFieldDecisions] = useState<Record<string, 'canonical' | 'duplicate'>>({});

  // Merge execution
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState('');
  const [mergeSuccess, setMergeSuccess] = useState('');

  async function loadGroups() {
    setLoading(true);
    const res = await fetch('/api/admin/students/detect-duplicates', { method: 'POST' });
    const data = await res.json();
    setGroups(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { loadGroups(); }, []);

  function handleSelect(groupName: string, studentId: string, role: 'canonical' | 'duplicate') {
    setSelections(prev => {
      const existing = prev[groupName] ?? { canonical: '', duplicate: '' };
      return { ...prev, [groupName]: { ...existing, [role]: studentId } };
    });
  }

  async function handlePreview(groupName: string) {
    const sel = selections[groupName];
    if (!sel?.canonical || !sel?.duplicate) return;
    setPreviewGroupName(groupName);
    setPreviewLoading(true);
    setPreviewError('');
    setPreview(null);
    setFieldDecisions({});
    setMergeError('');
    setMergeSuccess('');

    const res = await fetch('/api/admin/students/merge-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canonical_id: sel.canonical, duplicate_id: sel.duplicate }),
    });
    const data = await res.json();
    setPreviewLoading(false);

    if (!res.ok) {
      setPreviewError(data.error ?? 'Preview failed');
      return;
    }

    setPreview(data);
    // Default all field decisions to 'canonical'
    const defaults: Record<string, 'canonical' | 'duplicate'> = {};
    for (const fc of data.field_conflicts) {
      defaults[fc.field] = 'canonical';
    }
    setFieldDecisions(defaults);
  }

  async function handleMerge() {
    if (!preview) return;
    const sel = selections[previewGroupName];
    if (!sel) return;

    setMerging(true);
    setMergeError('');
    setMergeSuccess('');

    const res = await fetch('/api/admin/students/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        canonical_id: sel.canonical,
        duplicate_id: sel.duplicate,
        field_decisions: fieldDecisions,
        confirmation: true,
      }),
    });
    const data = await res.json();
    setMerging(false);

    if (!res.ok) {
      setMergeError(data.error ?? 'Merge failed');
      return;
    }

    const warnings = (data.warnings ?? []).length > 0
      ? ` (warnings: ${data.warnings.join(', ')})`
      : '';
    setMergeSuccess(`Merge complete. ${Object.values(data.repoint_counts as Record<string, number>).reduce((a: number, b: number) => a + b, 0)} rows repointed.${warnings}`);

    // Close modal after brief display, refresh groups
    setTimeout(() => {
      setPreview(null);
      setPreviewGroupName('');
      setMergeSuccess('');
      loadGroups();
    }, 2000);
  }

  function closeModal() {
    if (merging) return; // don't close during merge
    setPreview(null);
    setPreviewGroupName('');
    setPreviewError('');
    setMergeError('');
    setMergeSuccess('');
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Student Merge Tool</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? 'Detecting duplicates...' : `${groups.length} duplicate group${groups.length !== 1 ? 's' : ''} detected`}
          </p>
        </div>
        <button onClick={loadGroups} disabled={loading} className="btn-secondary text-sm">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : groups.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-400 text-sm">No duplicate students detected.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const sel = selections[group.name] ?? { canonical: '', duplicate: '' };
            const canPreview = sel.canonical && sel.duplicate && sel.canonical !== sel.duplicate;

            return (
              <div key={group.name} className="card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-semibold text-gray-900">{group.name}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    group.match_type === 'exact'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {group.match_type}
                  </span>
                  <span className="text-xs text-gray-400">{group.students.length} records</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 uppercase border-b border-gray-100">
                      <tr>
                        <th className="text-left py-1.5 pr-2">Keep</th>
                        <th className="text-left py-1.5 pr-2">Merge</th>
                        <th className="text-left py-1.5 pr-2">Email</th>
                        <th className="text-left py-1.5 pr-2">Parent Email</th>
                        <th className="text-right py-1.5 pr-2">Purchased</th>
                        <th className="text-right py-1.5 pr-2">Used</th>
                        <th className="text-right py-1.5 pr-2">Target</th>
                        <th className="text-left py-1.5">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {group.students.map(s => (
                        <tr key={s.id}>
                          <td className="py-2 pr-2">
                            <input
                              type="radio"
                              name={`canonical-${group.name}`}
                              checked={sel.canonical === s.id}
                              onChange={() => handleSelect(group.name, s.id, 'canonical')}
                              className="accent-green-600"
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <input
                              type="radio"
                              name={`duplicate-${group.name}`}
                              checked={sel.duplicate === s.id}
                              onChange={() => handleSelect(group.name, s.id, 'duplicate')}
                              className="accent-red-500"
                            />
                          </td>
                          <td className="py-2 pr-2 text-gray-700">{s.email ?? '—'}</td>
                          <td className="py-2 pr-2 text-gray-500">{s.parent_email ?? '—'}</td>
                          <td className="py-2 pr-2 text-right">{s.purchased_hours ?? '—'}</td>
                          <td className="py-2 pr-2 text-right">{s.used_hours ?? '—'}</td>
                          <td className="py-2 pr-2 text-right">{s.target_score ?? '—'}</td>
                          <td className="py-2 text-gray-400 text-xs">{new Date(s.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => handlePreview(group.name)}
                    disabled={!canPreview || previewLoading}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    {previewLoading && previewGroupName === group.name
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading preview...</>
                      : 'Preview Merge'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview / Merge Modal */}
      <Modal
        open={!!(preview || previewError)}
        onClose={closeModal}
        title={preview ? `Merge: ${preview.duplicate.name} → ${preview.canonical.name}` : 'Merge Preview'}
        size="lg"
      >
        {previewError && !preview && (
          <div className="text-center py-4">
            <p className="text-red-600 text-sm">{previewError}</p>
            <button onClick={closeModal} className="btn-secondary text-sm mt-3">Close</button>
          </div>
        )}

        {preview && (
          <div className="space-y-5 max-h-[70vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <p><strong>Canonical (KEEPS):</strong> {preview.canonical.name} — {preview.canonical.email}</p>
              <p><strong>Duplicate (MERGES IN):</strong> {preview.duplicate.name} — {preview.duplicate.email}</p>
            </div>

            {/* Field conflicts */}
            {preview.field_conflicts.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Field Conflicts</h4>
                <div className="space-y-2">
                  {preview.field_conflicts.map(fc => (
                    <div key={fc.field} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{fc.field}</p>
                      <div className="flex items-center gap-4 text-sm">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            checked={fieldDecisions[fc.field] === 'canonical'}
                            onChange={() => setFieldDecisions(prev => ({ ...prev, [fc.field]: 'canonical' }))}
                            className="accent-green-600"
                          />
                          <span className="text-green-700">{String(fc.canonical_value)}</span>
                          <span className="text-xs text-gray-400">(canonical)</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            checked={fieldDecisions[fc.field] === 'duplicate'}
                            onChange={() => setFieldDecisions(prev => ({ ...prev, [fc.field]: 'duplicate' }))}
                            className="accent-red-500"
                          />
                          <span className="text-red-700">{String(fc.duplicate_value)}</span>
                          <span className="text-xs text-gray-400">(duplicate)</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contract conflicts */}
            {preview.contract_conflicts.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Contract Conflicts</h4>
                <div className="space-y-2">
                  {preview.contract_conflicts.map(cc => (
                    <div key={cc.tutor_id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
                      <p className="font-medium">{cc.tutor_name}</p>
                      <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
                        <div className={cc.will_keep === 'canonical' ? 'text-green-700' : 'text-red-500'}>
                          Canonical: signed {new Date(cc.canonical_contract.signed_at).toLocaleDateString()} · ${cc.canonical_contract.hourly_rate}/hr
                          {cc.will_keep === 'canonical' ? ' ← KEEP' : ' ← VOID'}
                        </div>
                        <div className={cc.will_keep === 'duplicate' ? 'text-green-700' : 'text-red-500'}>
                          Duplicate: signed {new Date(cc.duplicate_contract.signed_at).toLocaleDateString()} · ${cc.duplicate_contract.hourly_rate}/hr
                          {cc.will_keep === 'duplicate' ? ' ← KEEP' : ' ← VOID'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Repoint counts */}
            {Object.keys(preview.repoint_counts).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Rows to Repoint</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(preview.repoint_counts)
                    .filter(([, count]) => (count as number) > 0)
                    .map(([table, count]) => (
                      <span key={table} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                        {table}: {count as number}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {/* Hours */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
              <p>
                <strong>Purchased:</strong> {preview.canonical.purchased_hours ?? 0} + {preview.duplicate.purchased_hours ?? 0} = {preview.hours_after_merge.purchased}
              </p>
              <p>
                <strong>Used:</strong> {preview.canonical.used_hours ?? 0} + {preview.duplicate.used_hours ?? 0} = {preview.hours_after_merge.used}
              </p>
            </div>

            {/* Errors / Success */}
            {mergeError && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{mergeError}</p>}
            {mergeSuccess && <p className="text-green-600 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">{mergeSuccess}</p>}

            {/* Actions */}
            {!mergeSuccess && (
              <div className="flex gap-3 pt-1">
                <button onClick={closeModal} disabled={merging} className="btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button
                  onClick={handleMerge}
                  disabled={merging}
                  className="btn-primary flex-1 justify-center bg-red-600 hover:bg-red-700"
                >
                  {merging
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Merging...</>
                    : 'Confirm Merge'}
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
}
