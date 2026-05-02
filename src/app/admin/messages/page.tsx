'use client';

import { useEffect, useState, useRef } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import { Send, Loader2, MessageSquare, Search, AlertTriangle, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';

interface Message {
  id: string;
  student_id: string;
  sender_role: 'parent' | 'admin' | 'student';
  body: string;
  read_at: string | null;
  created_at: string;
}

interface ConversationStudent {
  id: string;
  name: string;
  parent_email: string | null;
  unread: number;
  lastMessage: string;
  lastAt: string;
}

const TEMPLATES = [
  { label: 'Confirming session', text: 'Hi! Just confirming your upcoming session is on the schedule. Let us know if you have any questions.' },
  { label: 'Session reminder', text: 'Reminder: you have a session coming up soon! Please make sure to log in on time.' },
  { label: 'Progress update', text: "Great news — your student is making solid progress! We'll share a detailed update in the next report." },
  { label: 'Need to reschedule', text: "We need to reschedule an upcoming session due to a scheduling conflict. Please let us know your availability." },
  { label: 'Low hours warning', text: "Your student is running low on purchased hours. Please reach out if you'd like to add more sessions." },
  { label: 'Thanks + follow up', text: "Thank you for your message! We'll look into this and get back to you shortly." },
];

export default function AdminMessagesPage() {
  const supabase = createClient();
  const [conversations, setConversations] = useState<ConversationStudent[]>([]);
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [messages, setMessages]           = useState<Message[]>([]);
  const [body, setBody]                   = useState('');
  const [sending, setSending]             = useState(false);
  const [sendError, setSendError]         = useState('');
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState('');
  const [urgentIds, setUrgentIds]         = useState<Set<string>>(new Set());
  const [showTemplates, setShowTemplates] = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadConversations(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close templates dropdown on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (templatesRef.current && !templatesRef.current.contains(e.target as Node)) {
        setShowTemplates(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function loadConversations() {
    setLoading(true);
    const { data: msgs } = await supabase
      .from('messages')
      .select('student_id, sender_role, body, read_at, created_at')
      .order('created_at', { ascending: false });

    if (!msgs?.length) { setConversations([]); setLoading(false); return; }

    const seen = new Set<string>();
    const studentIds = msgs.map((m: any) => m.student_id).filter((id: string) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    const { data: students } = await supabase
      .from('students')
      .select('id, name, parent_email')
      .in('id', studentIds);

    const convs: ConversationStudent[] = (students ?? []).map((s: any) => {
      const studentMsgs = msgs.filter((m: any) => m.student_id === s.id);
      const latest = studentMsgs[0];
      const unread = studentMsgs.filter((m: any) => m.sender_role !== 'admin' && !m.read_at).length;
      return {
        id: s.id,
        name: s.name,
        parent_email: s.parent_email,
        unread,
        lastMessage: latest?.body ?? '',
        lastAt: latest?.created_at ?? '',
      };
    }).sort((a, b) => {
      // Urgent first, then by unread, then by last message time
      const aUrgent = urgentIds.has(a.id) ? 1 : 0;
      const bUrgent = urgentIds.has(b.id) ? 1 : 0;
      if (bUrgent !== aUrgent) return bUrgent - aUrgent;
      if (b.unread !== a.unread) return b.unread - a.unread;
      return b.lastAt.localeCompare(a.lastAt);
    });

    setConversations(convs);
    setLoading(false);

    if (convs.length && !selectedId) {
      selectConversation(convs[0].id);
    }
  }

  async function selectConversation(studentId: string) {
    setSelectedId(studentId);
    setShowTemplates(false);
    const { data } = await supabase
      .from('messages')
      .select('id, student_id, sender_role, body, read_at, created_at')
      .eq('student_id', studentId)
      .order('created_at');
    setMessages((data as any[]) ?? []);
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .neq('sender_role', 'admin')
      .is('read_at', null);
    setConversations(prev => prev.map(c => c.id === studentId ? { ...c, unread: 0 } : c));
  }

  async function sendReply() {
    if (!body.trim() || !selectedId || sending) return;
    setSending(true);
    setSendError('');
    const res = await fetch('/api/admin/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: selectedId, body }),
    });
    if (res.ok) {
      const msg = await res.json();
      setMessages(prev => [...prev, msg]);
      setBody('');
      setConversations(prev => prev.map(c =>
        c.id === selectedId ? { ...c, lastMessage: body, lastAt: new Date().toISOString() } : c,
      ));
    } else {
      const d = await res.json().catch(() => ({}));
      setSendError(d.error ?? 'Failed to send message');
    }
    setSending(false);
  }

  function toggleUrgent(id: string) {
    setUrgentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = conversations.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.parent_email ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const selectedStudent = conversations.find(c => c.id === selectedId);
  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
            {totalUnread > 0 && (
              <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
                {totalUnread} unread
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm mt-1">In-portal messaging with parents</p>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 card rounded-xl" />)}
        </div>
      ) : conversations.length === 0 ? (
        <div className="card p-12 text-center">
          <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No messages yet.</p>
        </div>
      ) : (
        <div className="flex gap-4" style={{ height: 'calc(100vh - 170px)' }}>
          {/* Sidebar */}
          <div className="w-72 flex-shrink-0 card overflow-hidden flex flex-col">
            {/* Search */}
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search conversations…"
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-400"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-8">No conversations match.</p>
              )}
              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => selectConversation(c.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${
                    selectedId === c.id ? 'bg-navy-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {urgentIds.has(c.id) && (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                      )}
                      <p className="font-semibold text-sm text-gray-900 truncate">{c.name}</p>
                    </div>
                    {c.unread > 0 && (
                      <span className="flex-shrink-0 w-5 h-5 bg-navy-600 text-white text-xs rounded-full flex items-center justify-center font-bold">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  {c.parent_email && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{c.parent_email}</p>
                  )}
                  {c.lastMessage && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{c.lastMessage}</p>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Chat */}
          <div className="flex-1 card overflow-hidden flex flex-col min-w-0">
            {selectedStudent && (
              <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{selectedStudent.name}</p>
                  {selectedStudent.parent_email && (
                    <p className="text-xs text-gray-400">{selectedStudent.parent_email}</p>
                  )}
                </div>
                <button
                  onClick={() => toggleUrgent(selectedStudent.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    urgentIds.has(selectedStudent.id)
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                  title="Toggle urgent flag"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {urgentIds.has(selectedStudent.id) ? 'Urgent' : 'Mark Urgent'}
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No messages yet.</p>
              )}
              {messages.map(msg => {
                const isAdmin = msg.sender_role === 'admin';
                return (
                  <div key={msg.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                    <div>
                      <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed max-w-sm ${
                        isAdmin
                          ? 'bg-navy-600 text-white rounded-tr-sm'
                          : 'bg-gray-100 text-gray-900 rounded-tl-sm'
                      }`}>
                        {msg.body}
                      </div>
                      <p className={`text-xs text-gray-400 mt-1 ${isAdmin ? 'text-right' : 'text-left'}`}>
                        {isAdmin ? 'You (Admin)' : msg.sender_role === 'parent' ? 'Parent' : 'Student'}
                        {' · '}{format(new Date(msg.created_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div className="flex-shrink-0 border-t border-gray-100 px-4 py-3">
              <div className="flex gap-2">
                {/* Templates dropdown */}
                <div className="relative" ref={templatesRef}>
                  <button
                    onClick={() => setShowTemplates(v => !v)}
                    className="btn-secondary px-2.5 py-2 text-xs flex items-center gap-1"
                    disabled={!selectedId}
                  >
                    Templates <ChevronDown className="w-3 h-3" />
                  </button>
                  {showTemplates && (
                    <div className="absolute bottom-full mb-1 left-0 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                      {TEMPLATES.map((t, i) => (
                        <button
                          key={i}
                          onClick={() => { setBody(t.text); setShowTemplates(false); }}
                          className="w-full text-left px-3 py-2.5 text-xs hover:bg-gray-50 border-b border-gray-50 last:border-0"
                        >
                          <p className="font-medium text-gray-800">{t.label}</p>
                          <p className="text-gray-400 truncate mt-0.5">{t.text}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <input
                  type="text"
                  value={body}
                  onChange={e => { setBody(e.target.value); setSendError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  placeholder="Reply…"
                  className="input flex-1 text-sm"
                  disabled={!selectedId || sending}
                />
                <button
                  onClick={sendReply}
                  disabled={!body.trim() || !selectedId || sending}
                  className="btn-primary px-3 py-2 disabled:opacity-50"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
              {sendError && <p className="text-red-500 text-xs mt-1 px-1">{sendError}</p>}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
