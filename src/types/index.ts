export type AvailabilityMode = 'form' | 'manual';
export type ContractStatus = 'pending' | 'signed' | 'voided';
export type SessionStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'no_show_student' | 'no_show_tutor' | 'no_show_both';
export type PaymentStatus = 'pending' | 'paid' | 'waived';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'voided';

export interface Invoice {
  id: string;
  student_id: string;
  period_start: string;
  period_end: string;
  amount: number;
  status: InvoiceStatus;
  notes: string | null;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
  student?: { name: string; email: string; parent_email: string | null } | null;
}

export interface Tutor {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  photo_url: string | null;
  bio: string | null;
  subjects: string[];
  hourly_rate: number;
  payment_info: string | null;
  zoom_user_id: string | null;
  availability_mode: AvailabilityMode;
  password_hash: string | null;
  setup_token: string | null;
  setup_token_expires_at: string | null;
  last_login_at: string | null;
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expires_at: string | null;
  google_calendar_connected: boolean;
  created_at: string;
}

export interface TutorAvailability {
  id: string;
  tutor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  parent_name: string | null;
  parent_email: string | null;
  grade: number | null;
  target_score: number | null;
  current_score: number | null;
  notes: string | null;
  status: string;
  purchased_hours: number | null;
  used_hours: number | null;
  low_hours_alerted: boolean;
  game_plan_url: string | null;
  game_plan_uploaded_at: string | null;
  // Onboarding
  onboarding_email_sent: boolean;
  onboarding_email_sent_at: string | null;
  onboarding_completed: boolean;
  intake_form_completed: boolean;
  kickoff_scheduled: boolean;
  game_plan_acknowledged: boolean;
  schedule_confirmed: boolean;
  // Intake form
  test_date: string | null;
  weak_areas: string[] | null;
  learning_style: string | null;
  additional_notes: string | null;
  school_name: string | null;
  gpa: string | null;
  study_hours_per_week: string | null;
  created_at: string;
  // Student portal
  portal_password_hash: string | null;
  portal_setup_token: string | null;
  portal_setup_token_expires_at: string | null;
  portal_last_login_at: string | null;
  xp_points: number;
  xp_level: number;
  avatar_animal: string;
  avatar_color: string;
  battle_cry: string | null;
  streak_weeks: number;
  last_session_week: string | null;
  badges: string[];
}

export interface Session {
  id: string;
  tutor_id: string;
  student_id: string;
  scheduled_at: string;
  duration_minutes: number;
  zoom_meeting_id: string | null;
  zoom_join_url: string | null;
  zoom_host_url: string | null;
  status: SessionStatus;
  session_notes: string | null;
  tutor_feedback: string | null;
  payment_status: PaymentStatus;
  payment_amount: number | null;
  reminder_24h_sent: boolean;
  reminder_1h_sent: boolean;
  rescheduled_from: string | null;
  reschedule_reason: string | null;
  reschedule_count: number;
  reschedule_requested: boolean;
  cancellation_reason: string | null;
  google_event_id: string | null;
  fathom_recording_url: string | null;
  fathom_summary: string | null;
  tutor_rating: number | null;
  created_at: string;
  // Joined
  tutor?: Tutor;
  student?: Student;
}

export interface Contract {
  id: string;
  tutor_id: string;
  student_id: string;
  hourly_rate: number;
  game_plan_url: string | null;
  game_plan_path: string | null;
  status: ContractStatus;
  signed_at: string | null;
  tutor_signature: string | null;
  violation_count: number;
  pdf_url: string | null;
  created_at: string;
  tutor?: Tutor;
  student?: Student;
}

export interface StudentAvailability {
  id: string;
  student_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
}

export interface StudentProgress {
  id: string;
  student_id: string;
  session_id: string | null;
  math_score: number | null;
  reading_score: number | null;
  writing_score: number | null;
  total_score: number | null;
  notes: string | null;
  recorded_at: string;
}

export interface TutorSwitch {
  id: string;
  student_id: string;
  old_tutor_id: string;
  new_tutor_id: string;
  reason: string | null;
  switched_at: string;
  switched_by: string;
  notes: string | null;
}
