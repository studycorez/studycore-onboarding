export async function getAvailableSlots(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  session: { tutor_id: string; scheduled_at: string; duration_minutes: number },
): Promise<string[]> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000); // must be >24h out
  const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [availRes, bookedRes] = await Promise.all([
    supabase
      .from('tutor_availability')
      .select('day_of_week, start_time, end_time')
      .eq('tutor_id', session.tutor_id)
      .eq('is_active', true),
    supabase
      .from('sessions')
      .select('scheduled_at, duration_minutes')
      .eq('tutor_id', session.tutor_id)
      .eq('status', 'scheduled')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', twoWeeksOut.toISOString()),
  ]);

  const availability = availRes.data ?? [];
  const booked = bookedRes.data ?? [];

  const slots: string[] = [];

  // Iterate each day in the next 14 days
  for (let d = 0; d < 14; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() + d);
    const dow = day.getDay();
    const daySlots = availability.filter((a: any) => a.day_of_week === dow);

    for (const avail of daySlots) {
      const [sh, sm] = avail.start_time.split(':').map(Number);
      const [eh, em] = avail.end_time.split(':').map(Number);
      let h = sh, m = sm;

      while (h * 60 + m + session.duration_minutes <= eh * 60 + em) {
        const slotDate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);

        // Skip slots not >24h in the future
        if (slotDate > cutoff) {
          // Skip if conflicts with existing booked session
          const conflicts = booked.some((b: any) => {
            const bs = new Date(b.scheduled_at).getTime();
            const be = bs + b.duration_minutes * 60 * 1000;
            const ss = slotDate.getTime();
            const se = ss + session.duration_minutes * 60 * 1000;
            return ss < be && se > bs;
          });

          // Skip if same as current session time
          const isSameAsOriginal =
            Math.abs(slotDate.getTime() - new Date(session.scheduled_at).getTime()) < 30 * 60 * 1000;

          if (!conflicts && !isSameAsOriginal) {
            slots.push(slotDate.toISOString());
          }
        }

        m += 30;
        if (m >= 60) { h += 1; m -= 60; }
      }
    }
  }

  return slots;
}
