'use client';

import { useState, useEffect } from 'react';
import { useStudentAuth } from '@/hooks/useStudentAuth';
import StudentPortalLayout from '@/components/student-portal/StudentPortalLayout';
import { ANIMALS, COLORS, getAnimalEmoji, getColorHex } from '@/lib/xp';
import { Loader2, Check, Save } from 'lucide-react';

export default function ProfilePage() {
  const { student, loading, setStudent } = useStudentAuth();

  const [animal, setAnimal]   = useState('Fox');
  const [color, setColor]     = useState('Purple');
  const [cry, setCry]         = useState('');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');

  // Privacy toggles
  const [canSeeScores,   setCanSeeScores]   = useState(true);
  const [canSeeHomework, setCanSeeHomework] = useState(true);
  const [canSeeXp,       setCanSeeXp]       = useState(true);
  const [privacySaving,  setPrivacySaving]  = useState(false);
  const [privacySaved,   setPrivacySaved]   = useState(false);

  useEffect(() => {
    if (!student) return;
    setAnimal(student.avatar_animal ?? 'Fox');
    setColor(student.avatar_color ?? 'Purple');
    setCry(student.battle_cry ?? '');
    setCanSeeScores(student.parent_can_see_scores  ?? true);
    setCanSeeHomework(student.parent_can_see_homework ?? true);
    setCanSeeXp(student.parent_can_see_xp      ?? true);
  }, [student]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError('');

    const res = await fetch('/api/student-portal/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar_animal: animal, avatar_color: color, battle_cry: cry || null }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Failed to save. Please try again.');
      setSaving(false);
      return;
    }

    // Update local state
    if (student) {
      setStudent({ ...student, avatar_animal: animal, avatar_color: color, battle_cry: cry || null });
    }
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handlePrivacySave() {
    setPrivacySaving(true);
    await fetch('/api/student-portal/privacy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_can_see_scores: canSeeScores, parent_can_see_homework: canSeeHomework, parent_can_see_xp: canSeeXp }),
    });
    setPrivacySaved(true);
    setPrivacySaving(false);
    setTimeout(() => setPrivacySaved(false), 3000);
  }

  if (loading) {
    return (
      <StudentPortalLayout student={null}>
        <div className="animate-pulse space-y-4 max-w-2xl">
          {[1, 2, 3].map(i => <div key={i} className="h-40 card rounded-xl" />)}
        </div>
      </StudentPortalLayout>
    );
  }

  if (!student) return null;

  const previewEmoji = getAnimalEmoji(animal);
  const previewHex   = getColorHex(color);

  return (
    <StudentPortalLayout student={student}>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="text-gray-500 text-sm mt-1">Customize your leaderboard identity</p>
        </div>

        {/* Live Preview */}
        <div className="card p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Leaderboard Preview</p>
          <div className="flex items-center gap-3 p-3 bg-navy-50 border border-navy-100 rounded-xl">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
              style={{ backgroundColor: previewHex + '22', border: `2px solid ${previewHex}` }}
            >
              {previewEmoji}
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">{color} {animal}</p>
              {cry && <p className="text-xs text-gray-500 italic">"{cry}"</p>}
            </div>
            <span className="ml-auto text-xs bg-navy-100 text-navy-700 rounded-full px-2 py-0.5 font-semibold">You</span>
          </div>
        </div>

        {/* Animal Picker */}
        <div className="card p-5">
          <p className="text-sm font-semibold text-gray-900 mb-3">Choose Your Animal</p>
          <div className="grid grid-cols-5 gap-2">
            {ANIMALS.map(a => (
              <button
                key={a.name}
                type="button"
                onClick={() => setAnimal(a.name)}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all text-center ${
                  animal === a.name
                    ? 'border-navy-600 bg-navy-50'
                    : 'border-gray-100 hover:border-gray-300'
                }`}
              >
                <span className="text-2xl">{a.emoji}</span>
                <span className="text-xs text-gray-600 leading-tight">{a.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Color Picker */}
        <div className="card p-5">
          <p className="text-sm font-semibold text-gray-900 mb-3">Choose Your Color</p>
          <div className="grid grid-cols-5 gap-3">
            {COLORS.map(c => (
              <button
                key={c.name}
                type="button"
                onClick={() => setColor(c.name)}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                  color === c.name ? 'border-gray-900' : 'border-gray-100 hover:border-gray-300'
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full flex-shrink-0"
                  style={{ backgroundColor: c.hex }}
                />
                <span className="text-xs text-gray-600">{c.name}</span>
                {color === c.name && <Check className="w-3 h-3 text-gray-900" />}
              </button>
            ))}
          </div>
        </div>

        {/* Battle Cry */}
        <div className="card p-5">
          <p className="text-sm font-semibold text-gray-900 mb-1">Battle Cry</p>
          <p className="text-xs text-gray-500 mb-3">Shows under your name on the leaderboard (max 50 chars)</p>
          <input
            type="text"
            maxLength={50}
            placeholder="e.g. Let's ace this SAT!"
            value={cry}
            onChange={e => setCry(e.target.value)}
            className="input w-full"
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{cry.length}/50</p>
        </div>

        {/* Privacy Settings */}
        <div className="card p-5">
          <p className="text-sm font-semibold text-gray-900 mb-1">Privacy Settings</p>
          <p className="text-xs text-gray-500 mb-4">Control what your parents can see in their portal</p>
          <div className="space-y-3">
            {[
              { label: 'Show my scores to parents',         value: canSeeScores,   set: setCanSeeScores   },
              { label: 'Show my homework status to parents', value: canSeeHomework, set: setCanSeeHomework },
              { label: 'Show my XP and level to parents',   value: canSeeXp,       set: setCanSeeXp       },
            ].map(({ label, value, set }) => (
              <label key={label} className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-gray-700">{label}</span>
                <button
                  type="button"
                  onClick={() => set(!value)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${value ? 'bg-[#1e2090]' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={handlePrivacySave}
            disabled={privacySaving}
            className="btn-secondary mt-4 w-full justify-center"
          >
            {privacySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {privacySaving ? 'Saving…' : privacySaved ? '✓ Saved!' : 'Save Privacy Settings'}
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
        )}

        {saved && (
          <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-2">
            <Check className="w-4 h-4" /> Profile saved!
          </p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full justify-center"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </div>
    </StudentPortalLayout>
  );
}
