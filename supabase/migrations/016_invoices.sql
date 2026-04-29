create type invoice_status as enum ('draft', 'sent', 'paid', 'voided');

create table if not exists invoices (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  amount        numeric(10,2) not null default 0,
  status        invoice_status not null default 'draft',
  notes         text,
  sent_at       timestamptz,
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_invoices_student on invoices(student_id);
create index if not exists idx_invoices_status  on invoices(status);

alter table invoices enable row level security;
drop policy if exists "auth_all_invoices" on invoices;
create policy "auth_all_invoices" on invoices for all using (auth.role() = 'authenticated');
