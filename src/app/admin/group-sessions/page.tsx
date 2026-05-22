'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import { format, isPast } from 'date-fns';
import { Copy, Check, ExternalLink, Video, Users, Save } from 'lucide-react';

function CopyBtn({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : 'Copy Link'}
    </button>
  );
}

interface GroupSession {
  id: string;
  scheduled_at: string;
  zoom_join_url: string | null;
  status: string;
  max_students: number | null;
  _attendanceCount?: number;
}

interface AttendanceRecord {
  session_id: string;
  student_id: string;
  attended: boolean;
  hours_deducted: number;
  student: { name: string } | null;
}

export default function GroupSessionsPage() {
  const supabase = createClient();
  const [mondaySessions,   setMondaySessions]   = useState<GroupSession[]>([]);
  const [saturdaySessions, setSaturdaySessions] = useState<GroupSession[]>([]);
  const [attendance,       setAttendance]       = useState<AttendanceRecord[]>([]);
  const [loading,          setLoading]          = useState(true);

  // Group link state
  const [mondayLink,    setMondayLink]    = useState('');
  const [saturdayLink,  setSaturdayLink]  = useState('');
  const [linkSaving,    setLinkSaving]    = useState(false);
  const [linkSaved,     setLinkSaved]     = useState(false);

  useEffect(() => {
    fetch('/api/admin/group-links').then(r => r.json()).then(d => {
      setMondayLink(d.monday ?? '');
      setSaturdayLink(d.saturday ?? '');
    });
  }, []);

  async function saveLinks() {
    setLinkSaving(true);
    setLinkSaved(false);
    const res = await fetch('/api/admin/group-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monday: mondayLink, saturday: saturdayLink }),
    });
    setLinkSaving(false);
    if (res.ok) { setLinkSaved(true); setTimeout(() => setLinkSaved(false), 3000); }
  }

  useEffect(() => {
    async function load() {
      const DAVID_ID = '3f2ab4fe-74a9-453a-9037-4739889547a9';

      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, scheduled_at, zoom_join_url, status, max_students')
        .eq('tutor_id', DAVID_ID)
        .eq('is_group_session', true)
        .order('scheduled_at');

      const allSessions = (sessions as GroupSession[]) ?? [];
      setMondaySessions(allSessions.filter(s => new Date(s.scheduled_at).getUTCDay() === 1));
      setSaturdaySessions(allSessions.filter(s => new Date(s.scheduled_at).getUTCDay() === 6));

      // Load attendance for past sessions
      const pastIds = allSessions.filter(s => isPast(new Date(s.scheduled_at))).map(s => s.id);
      if (pastIds.length > 0) {
        const { data: att } = await supabase
          .from('group_session_attendance')
          .select('session_id, student_id, attended, hours_deducted, student:students(name)')
          .in('session_id', pastIds)
          .eq('attended', true);
        setAttendance((att as any[]) ?? []);
      }

      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function attendanceFor(sessionId: string) {
    return attendance.filter(a => a.session_id === sessionId);
  }

  function SessionList({ sessions, day }: { sessions: GroupSession[]; day: string }) {
    const upcoming = sessions.filter(s => !isPast(new Date(s.scheduled_at)));
    const past     = sessions.filter(s =>  isPast(new Date(s.scheduled_at)));

    return (
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-navy-500" />
            <h2 className="font-semibold text-gray-900">{day} Sessions</h2>
          </div>
          <span className="text-xs text-gray-400">{sessions.length} scheduled</span>
        </div>

        {upcoming.length > 0 && (
          <div>
            <p className="px-5 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Upcoming</p>
            <div className="divide-y divide-gray-50">
              {upcoming.map(s => (
                <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {format(new Date(s.scheduled_at), "EEE, MMM d 'at' h:mm a")} UTC
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(new Date(s.scheduled_at), "EEE, MMM d")} ·{' '}
                      {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }).format(new Date(s.scheduled_at))} ET
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <CopyBtn url={s.zoom_join_url ?? ''} />
                    <a
                      href={s.zoom_join_url ?? '#'}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Join
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {past.length > 0 && (
          <div>
            <p className="px-5 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Past</p>
            <div className="divide-y divide-gray-50">
              {past.map(s => {
                const att = attendanceFor(s.id);
                return (
                  <div key={s.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-gray-700">
                        {format(new Date(s.scheduled_at), "EEE, MMM d")} ·{' '}
                        {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }).format(new Date(s.scheduled_at))} ET
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Users className="w-3.5 h-3.5" />
                        {att.length} attended
                      </div>
                    </div>
                    {att.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {att.map(a => (
                          <span key={a.student_id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                            {(a.student as any)?.name ?? 'Unknown'} · {a.hours_deducted}h
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {sessions.length === 0 && (
          <p className="px-5 py-6 text-gray-400 text-sm">No sessions created yet.</p>
        )}
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Group Sessions</h1>
        <p className="text-gray-500 text-sm mt-1">David Zhu's recurring group sessions — permanent Zoom links</p>
      </div>

      {/* Permanent Zoom Links — editable */}
      <div className="card p-5 mb-6">
        <p className="text-sm font-semibold text-gray-700 mb-4">Permanent Zoom Links</p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          {[
            { label: 'Monday Group Session', time: '7:00–8:00 PM ET', value: mondayLink, onChange: setMondayLink },
            { label: 'Saturday Group Session', time: '4:30–5:30 PM ET', value: saturdayLink, onChange: setSaturdayLink },
          ].map(({ label, time, value, onChange }) => (
            <div key={label} className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Video className="w-4 h-4 text-navy-500" />
                <p className="font-semibold text-gray-900 text-sm">{label}</p>
              </div>
              <p className="text-xs text-gray-500 mb-3">{time} · Permanent Zoom link</p>
              <input
                type="url"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder="https://zoom.us/j/..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-navy-500 mb-2"
              />
              {value && (
                <div className="flex items-center gap-2">
                  <a href={value} target="_blank" rel="noopener"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> Join
                  </a>
                  <CopyBtn url={value} />
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={saveLinks}
          disabled={linkSaving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-navy-700 text-white hover:bg-navy-800 transition-colors disabled:opacity-50"
        >
          {linkSaved ? <Check className="w-4 h-4 text-green-300" /> : <Save className="w-4 h-4" />}
          {linkSaving ? 'Saving…' : linkSaved ? 'Saved!' : 'Save Links'}
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse grid grid-cols-2 gap-6">
          <div className="h-64 card rounded-xl" />
          <div className="h-64 card rounded-xl" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <SessionList sessions={mondaySessions}   day="Monday" />
          <SessionList sessions={saturdaySessions} day="Saturday" />
        </div>
      )}
    </AdminLayout>
  );
}
