'use client';

import { useEffect, useState, useRef } from 'react';
import { useParentAuth } from '@/hooks/useParentAuth';
import ParentPortalLayout from '@/components/parent-portal/ParentPortalLayout';
import { Send, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface Message {
  id: string;
  student_id: string;
  sender_role: 'parent' | 'admin' | 'student';
  body: string;
  read_at: string | null;
  created_at: string;
}

export default function MessagesPage() {
  const { parent, loading: authLoading } = useParentAuth();
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [body, setBody]           = useState('');
  const [sending, setSending]     = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-select first student
  useEffect(() => {
    if (parent?.students.length && !selectedStudentId) {
      setSelectedStudentId(parent.students[0].id);
    }
  }, [parent, selectedStudentId]);

  // Load messages + mark read when student changes
  useEffect(() => {
    if (!selectedStudentId) return;
    setMsgLoading(true);
    fetch(`/api/parent-portal/messages?student_id=${selectedStudentId}`)
      .then(r => r.json())
      .then(data => {
        setMessages(Array.isArray(data) ? data : []);
        setMsgLoading(false);
        // Mark admin messages as read
        fetch('/api/parent-portal/messages', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_id: selectedStudentId }),
        });
      });
  }, [selectedStudentId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    if (!body.trim() || !selectedStudentId || sending) return;
    setSending(true);
    const res = await fetch('/api/parent-portal/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: selectedStudentId, body }),
    });
    if (res.ok) {
      const msg = await res.json();
      setMessages(prev => [...prev, msg]);
      setBody('');
    }
    setSending(false);
  }

  const student = parent?.students.find(s => s.id === selectedStudentId);

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
      <div className="max-w-2xl">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="text-gray-500 text-sm mt-1">Send a message to your StudyCore advisor</p>
        </div>

        {/* Student selector (multiple students) */}
        {(parent?.students.length ?? 0) > 1 && (
          <div className="flex gap-2 mb-4">
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

        {/* Chat window */}
        <div className="card overflow-hidden flex flex-col" style={{ height: '480px' }}>
          <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0">
            <p className="text-sm font-semibold text-gray-900">
              {student ? `Conversation re: ${student.name}` : 'Select a student'}
            </p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {msgLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            )}
            {!msgLoading && messages.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">
                No messages yet. Send a message to get started!
              </p>
            )}
            {messages.map(msg => {
              const isAdmin = msg.sender_role === 'admin';
              return (
                <div key={msg.id} className={`flex ${isAdmin ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-xs lg:max-w-sm xl:max-w-md ${isAdmin ? '' : 'order-1'}`}>
                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isAdmin
                        ? 'bg-gray-100 text-gray-900 rounded-tl-sm'
                        : 'bg-navy-600 text-white rounded-tr-sm'
                    }`}>
                      {msg.body}
                    </div>
                    <p className={`text-xs text-gray-400 mt-1 ${isAdmin ? 'text-left' : 'text-right'}`}>
                      {isAdmin ? 'StudyCore' : 'You'} · {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Compose */}
          <div className="flex-shrink-0 border-t border-gray-100 px-4 py-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={body}
                onChange={e => setBody(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Type a message…"
                className="input flex-1 text-sm"
                disabled={!selectedStudentId || sending}
              />
              <button
                onClick={sendMessage}
                disabled={!body.trim() || !selectedStudentId || sending}
                className="btn-primary px-3 py-2 disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ParentPortalLayout>
  );
}
