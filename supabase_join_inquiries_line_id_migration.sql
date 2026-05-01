alter table public.join_inquiries
  add column if not exists line_id text;

comment on column public.join_inquiries.line_id is 'Optional Line ID provided by a public join inquiry submitter.';
