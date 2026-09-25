-- RDM Fashions: repair create_public_order RPC
-- Run this once in Supabase SQL Editor, then reload the cart page.

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

  select coalesce(sum((item->>'quantity')::integer),0)
  into v_quantity
  from jsonb_array_elements(p_items) item;

  v_subtotal := 99 * v_quantity;
  v_delivery := case
    when v_quantity > 0 then 40 + ((v_quantity - 1) * 20)
    else 0
  end;
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

notify pgrst, 'reload schema';
