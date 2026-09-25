-- RDM Fashions multi-variant ecommerce schema
-- One product, three color variants. Run once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  address text not null,
  email text not null,
  phone text not null,
  product_name text not null default 'Microfiber All Purpose Cloth',
  quantity integer not null check (quantity >= 1),
  subtotal numeric(10,2) not null,
  delivery_charge numeric(10,2) not null,
  total numeric(10,2) not null,
  status text not null default 'Pending'
    check (status in ('Pending','Ordered','Confirmed','Shipped','Delivered','Cancelled')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending','authorized','paid','failed')),
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null default 'microfiber-cloth',
  product_name text not null default 'Microfiber All Purpose Cloth',
  color text not null check (color in ('Light Brown','Dusty Pink','Slate Blue')),
  quantity integer not null check (quantity >= 1),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  line_total numeric(10,2) not null check (line_total >= 0)
);

create unique index if not exists orders_razorpay_order_id_key
  on public.orders (razorpay_order_id)
  where razorpay_order_id is not null;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false
);

alter table public.profiles enable row level security;

drop policy if exists "Admins can read orders" on public.orders;
create policy "Admins can read orders"
on public.orders for select to authenticated
using ((select is_admin from public.profiles where id = auth.uid()) = true);

drop policy if exists "Admins can update orders" on public.orders;
create policy "Admins can update orders"
on public.orders for update to authenticated
using ((select is_admin from public.profiles where id = auth.uid()) = true)
with check ((select is_admin from public.profiles where id = auth.uid()) = true);

drop policy if exists "Admins can read order items" on public.order_items;
create policy "Admins can read order items"
on public.order_items for select to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);

-- Compatibility migration for an older order_items.product_id UUID column.
-- This project uses the text product slug 'microfiber-cloth'.
alter table public.order_items drop constraint if exists order_items_product_id_fkey;
alter table public.order_items alter column product_id type text using product_id::text;
alter table public.order_items alter column product_id set default 'microfiber-cloth';

-- Replace every older create_public_order overload with one canonical RPC.
-- The extra (text,text,text,jsonb,text) drop is important because older
-- versions of this project used a different parameter order.
drop function if exists public.create_public_order(text,text,text,text,jsonb);
drop function if exists public.create_public_order(text,text,text,jsonb,text);
drop function if exists public.create_public_order(text,text,text,text,integer);
drop function if exists public.create_public_order(text,text,text,text,integer,numeric,numeric,numeric);

create or replace function public.create_public_order(
  p_customer_name text,
  p_address text,
  p_email text,
  p_phone text,
  p_items jsonb
)
returns table(id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_quantity integer;
  v_subtotal numeric(10,2);
  v_delivery numeric(10,2);
  v_total numeric(10,2);
  v_invalid_count integer;
begin
  if coalesce(trim(p_customer_name), '') = ''
     or coalesce(trim(p_address), '') = ''
     or coalesce(trim(p_email), '') = ''
     or coalesce(trim(p_phone), '') = '' then
    raise exception 'Customer details are required';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart items are required';
  end if;

  select count(*)
  into v_invalid_count
  from jsonb_array_elements(p_items) item
  where coalesce(item->>'product_id','microfiber-cloth') <> 'microfiber-cloth'
     or coalesce(item->>'product_name','Microfiber All Purpose Cloth') <> 'Microfiber All Purpose Cloth'
     or (item->>'color') not in ('Light Brown','Dusty Pink','Slate Blue')
     or coalesce((item->>'quantity')::integer,0) < 1;

  if v_invalid_count > 0 then
    raise exception 'Invalid cart item';
  end if;

  -- Authoritative server-side pricing for the current product.
  select coalesce(sum((item->>'quantity')::integer),0)
  into v_quantity
  from jsonb_array_elements(p_items) item;

  v_subtotal := 99 * v_quantity;
  -- Delivery: ₹40 for the first item, then +₹20 for each additional item.
  v_delivery := case when v_quantity > 0 then 40 + ((v_quantity - 1) * 20) else 0 end;
  v_total := v_subtotal + v_delivery;

  insert into public.orders (
    customer_name, address, email, phone, product_name,
    quantity, subtotal, delivery_charge, total, status
  )
  values (
    trim(p_customer_name), trim(p_address), trim(p_email), trim(p_phone),
    'Microfiber All Purpose Cloth',
    v_quantity, v_subtotal, v_delivery, v_total, 'Pending'
  )
  returning orders.id into v_order_id;

  insert into public.order_items (
    order_id, product_id, product_name, color, quantity, unit_price, line_total
  )
  select
    v_order_id,
    coalesce(item->>'product_id','microfiber-cloth'),
    'Microfiber All Purpose Cloth',
    item->>'color',
    (item->>'quantity')::integer,
    99,
    99 * (item->>'quantity')::integer
  from jsonb_array_elements(p_items) item;

  return query select v_order_id;
end;
$$;

revoke all on function public.create_public_order(text,text,text,text,jsonb) from public;
grant execute on function public.create_public_order(text,text,text,text,jsonb) to anon, authenticated;

drop function if exists public.get_public_order_history(uuid[]);

create or replace function public.get_public_order_history(p_order_ids uuid[])
returns table(
  id uuid,
  quantity integer,
  subtotal numeric,
  delivery_charge numeric,
  total numeric,
  status text,
  created_at timestamptz,
  items jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    o.id,
    o.quantity,
    o.subtotal,
    o.delivery_charge,
    o.total,
    o.status,
    o.created_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'color', oi.color,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'line_total', oi.line_total
          )
          order by oi.id
        )
        from public.order_items oi
        where oi.order_id = o.id
      ),
      '[]'::jsonb
    ) as items
  from public.orders o
  where o.id = any(p_order_ids);
$$;

revoke all on function public.get_public_order_history(uuid[]) from public;
grant execute on function public.get_public_order_history(uuid[]) to anon, authenticated;

-- Refresh PostgREST so the new RPC is immediately visible to supabase-js.
notify pgrst, 'reload schema';
