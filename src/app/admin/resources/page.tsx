'use client';

import { useEffect, useRef, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Loader2, Trash2, Upload, Link as LinkIcon } from 'lucide-react';

const TYPES      = ['loom','pdf','video','doc','other'];
const CATEGORIES = ['general','sop','training','sat_content','other'];

export default function AdminResourcesPage() {
  const [resources,    setResources]    = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [uploading,    setUploading]    = useState(false);
  const [error,        setError]        = useState('');
  const [inputMode,    setInputMode]    = useState<'url'|'file'>('url');
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: '', description: '', type: 'loom', category: 'general', url: '',
  });

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/resources');
    setResources(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setUploading(true);
    const fd = new FormData();
    fd.append('title',       form.title);
    fd.append('description', form.description);
    fd.append('type',        form.type);
    fd.append('category',    form.category);
    if (inputMode === 'url') {
      fd.append('url', form.url);
    } else {
      const file = fileRef.current?.files?.[0];
      if (!file) { setError('Please select a file.'); setUploading(false); return; }
      fd.append('file', file);
    }
    const res = await fetch('/api/admin/resources', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Upload failed'); setUploading(false); return; }
    setForm({ title: '', description: '', type: 'loom', category: 'general', url: '' });
    if (fileRef.current) fileRef.current.value = '';
    setUploading(false);
    load();
  }

  async function deleteResource(id: string) {
    await fetch(`/api/admin/resources/${id}`, { method: 'DELETE' });
    load();
  }

  const TYPE_COLORS: Record<string, string> = {
    loom: 'bg-purple-100 text-purple-700', pdf: 'bg-red-100 text-red-700',
    video: 'bg-blue-100 text-blue-700', doc: 'bg-green-100 text-green-700', other: 'bg-gray-100 text-gray-600',
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Resources</h1>
        <p className="text-gray-500 text-sm mt-1">Training materials, SOPs, and content for tutors</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Upload form */}
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Add Resource</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Title *</label>
              <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Type *</label>
                <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Category *</label>
                <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c.replace('_',' ')}</option>)}
                </select>
              </div>
            </div>

            {/* Input mode toggle */}
            <div>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-3 text-sm">
                <button type="button" onClick={() => setInputMode('url')}
                  className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 font-medium ${inputMode === 'url' ? 'bg-navy-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <LinkIcon className="w-3.5 h-3.5" /> URL
                </button>
                <button type="button" onClick={() => setInputMode('file')}
                  className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 font-medium ${inputMode === 'file' ? 'bg-navy-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <Upload className="w-3.5 h-3.5" /> File
                </button>
              </div>
              {inputMode === 'url' ? (
                <input className="input" placeholder="https://…" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
              ) : (
                <input ref={fileRef} type="file" className="input text-sm" accept=".pdf,.doc,.docx,.mp4,.mov,video/*" />
              )}
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
            <button type="submit" disabled={uploading} className="btn-primary w-full justify-center">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {uploading ? 'Uploading…' : 'Add Resource'}
            </button>
          </form>
        </div>

        {/* Resources table */}
        <div className="col-span-2 card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">All Resources ({resources.length})</h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : resources.length === 0 ? (
            <p className="px-5 py-8 text-gray-400 text-sm text-center">No resources yet.</p>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header">Title</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Category</th>
                  <th className="table-header">Link</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {resources.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="table-cell">
                      <p className="font-medium text-sm text-gray-900">{r.title}</p>
                      {r.description && <p className="text-xs text-gray-500 truncate max-w-48">{r.description}</p>}
                    </td>
                    <td className="table-cell">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${TYPE_COLORS[r.type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.type}
                      </span>
                    </td>
                    <td className="table-cell text-sm capitalize text-gray-500">{r.category.replace('_',' ')}</td>
                    <td className="table-cell">
                      {(r.url || r.file_url) && (
                        <a href={r.url ?? r.file_url} target="_blank" rel="noopener"
                          className="text-xs text-navy-600 hover:underline truncate max-w-32 block">
                          View ↗
                        </a>
                      )}
                    </td>
                    <td className="table-cell">
                      <button onClick={() => deleteResource(r.id)}
                        className="text-gray-300 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
