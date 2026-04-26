'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import StudentForm from '@/components/students/StudentForm';
import { createClient } from '@/lib/supabase/client';
import type { Student } from '@/types';
import { Users, Plus, Search } from 'lucide-react';
import Link from 'next/link';

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading]   = useState(true);
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState('');
  const supabase = createClient();

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('students').select('*').order('name');
    setStudents(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(query.toLowerCase()) ||
    s.email.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="text-gray-500 text-sm mt-1">{students.length} student{students.length !== 1 ? 's' : ''} enrolled</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Student
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="input pl-9 max-w-sm"
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-header">Name</th>
              <th className="table-header">Email</th>
              <th className="table-header">Grade</th>
              <th className="table-header">Current Score</th>
              <th className="table-header">Target Score</th>
              <th className="table-header">Parent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && (
              <tr><td colSpan={6} className="table-cell text-center text-gray-400 py-8">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400">{query ? 'No students match your search' : 'No students yet'}</p>
                </td>
              </tr>
            )}
            {filtered.map(s => (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors cursor-pointer">
                <td className="table-cell">
                  <Link href={`/students/${s.id}`} className="font-medium text-navy-700 hover:text-navy-900">{s.name}</Link>
                </td>
                <td className="table-cell text-gray-500">{s.email}</td>
                <td className="table-cell">{s.grade ? `Grade ${s.grade}` : '—'}</td>
                <td className="table-cell">{s.current_score ?? '—'}</td>
                <td className="table-cell">{s.target_score ?? '—'}</td>
                <td className="table-cell text-gray-500">{s.parent_name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Student" size="lg">
        <StudentForm
          onSuccess={() => { setOpen(false); load(); }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </AdminLayout>
  );
}
