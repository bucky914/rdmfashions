-- RDM Fashions: Razorpay payment fields
-- Run this once in the Supabase SQL Editor before deploying the Edge Functions.

alter table public.orders
  add column if not exists payment_status text not null default 'pending',
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_signature text;

-- Keep Razorpay Order IDs unique when present.
create unique index if not exists orders_razorpay_order_id_key
  on public.orders (razorpay_order_id)
  where razorpay_order_id is not null;

-- Helpful validation for new/updated payment state.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_payment_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_payment_status_check
      check (payment_status in ('pending','authorized','paid','failed'));
  end if;
end $$;

notify pgrst, 'reload schema';
