-- شغلي هذا الملف مرة واحدة داخل Supabase > SQL Editor
create extension if not exists pgcrypto;

create table if not exists public.app_kv (
  key text primary key,
  value jsonb not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  account_id text not null,
  provider text not null check (provider in ('google','microsoft','zoho')),
  email text not null,
  display_name text,
  refresh_token text not null,
  access_token text,
  expires_at bigint,
  zoho_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, provider, email),
  unique(session_id, account_id)
);
create index if not exists connected_accounts_session_idx on public.connected_accounts(session_id);

create table if not exists public.campaigns (
  id uuid primary key,
  session_id text not null,
  sender_account_id text,
  provider text not null,
  subject text not null,
  html_content text not null,
  use_greeting boolean not null default false,
  delay_ms integer not null default 3000 check (delay_ms between 1000 and 600000),
  status text not null default 'draft' check (status in ('draft','running','completed','completed_with_errors','stopped')),
  total_count integer not null default 0,
  prepared_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  retry_of uuid references public.campaigns(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists campaigns_session_idx on public.campaigns(session_id, created_at desc);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text,
  email text not null,
  status text not null default 'prepared' check (status in ('prepared','sending','sent','failed')),
  queue_position integer not null,
  error_message text,
  attempted_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(campaign_id, email)
);
create index if not exists campaign_recipients_status_idx on public.campaign_recipients(campaign_id, status, queue_position);

alter table public.app_kv enable row level security;
alter table public.connected_accounts enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;

-- لا ننشئ سياسات عامة: الوصول يتم من السيرفر فقط باستخدام SUPABASE_SECRET_KEY.

create or replace function public.record_campaign_result(
  p_campaign_id uuid,
  p_email text,
  p_status text,
  p_error text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'Invalid campaign result status';
  end if;

  update public.campaign_recipients
  set status = p_status,
      error_message = p_error,
      attempted_at = now(),
      sent_at = case when p_status = 'sent' then now() else null end
  where campaign_id = p_campaign_id and lower(email) = lower(p_email);

  update public.campaigns
  set sent_count = sent_count + case when p_status = 'sent' then 1 else 0 end,
      failed_count = failed_count + case when p_status = 'failed' then 1 else 0 end
  where id = p_campaign_id;
end;
$$;

revoke all on function public.record_campaign_result(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.record_campaign_result(uuid,text,text,text) to service_role;
