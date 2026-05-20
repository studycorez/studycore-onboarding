export async function getAvailableSlots(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  session: { tutor_id: string; scheduled_at: string; duration_minutes: number },
): Promise<string[]> {
  const now = new Date();
  const cutoff      = new Date(now.getTime() + 24 * 60 * 60 * 1000);       // >24h out
  const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [availRes, bookedRes] = await Promise.all([
    supabase
      .from('tutor_availability')
      .select('start_utc, end_utc')
      .eq('tutor_id', session.tutor_id)
      .eq('is_active', true)
      .not('start_utc', 'is', null), // only UTC-backfilled rows
    supabase
      .from('sessions')
      .select('scheduled_at, duration_minutes')
      .eq('tutor_id', session.tutor_id)
      .eq('status', 'scheduled')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', twoWeeksOut.toISOString()),
  ]);

  const availability: { start_utc: string; end_utc: string }[] = availRes.data ?? [];
  const booked: { scheduled_at: string; duration_minutes: number }[]  = bookedRes.data ?? [];

  const slotMs = session.duration_minutes * 60 * 1000;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const slots: string[] = [];

  for (const avail of availability) {
    const baseStart = new Date(avail.start_utc);
    const baseEnd   = new Date(avail.end_utc);
    const windowMs  = baseEnd.getTime() - baseStart.getTime();

    // Advance to the first occurrence that starts at or after the cutoff
    let windowStart = new Date(baseStart);
    while (windowStart < cutoff) {
      windowStart = new Date(windowStart.getTime() + weekMs);
    }

    // Yield 30-min candidate slots for each weekly occurrence within the window
    while (windowStart <= twoWeeksOut) {
      const windowEnd = new Date(windowStart.getTime() + windowMs);

      let t = new Date(windowStart);
      while (t.getTime() + slotMs <= windowEnd.getTime()) {
        const conflicts = booked.some(b => {
          const bs = new Date(b.scheduled_at).getTime();
          const be = bs + b.duration_minutes * 60 * 1000;
          const ss = t.getTime();
          const se = ss + slotMs;
          return ss < be && se > bs;
        });

        const isSameAsOriginal =
          Math.abs(t.getTime() - new Date(session.scheduled_at).getTime()) < 30 * 60 * 1000;

        if (!conflicts && !isSameAsOriginal) {
          slots.push(t.toISOString());
        }

        t = new Date(t.getTime() + 30 * 60 * 1000);
      }

      // Next week's occurrence
      windowStart = new Date(windowStart.getTime() + weekMs);
    }
  }

  return slots;
}
