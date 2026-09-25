# Brevo + Supabase Email Setup

This project sends two transactional emails after an order is created: one to the customer and one to the admin.

## Supabase Edge Function secrets

Add these in Supabase Dashboard → Edge Functions → Secrets:

```text
BREVO_API_KEY=your_brevo_api_key
ADMIN_EMAIL=fashionsrdm@gmail.com
BREVO_SENDER_EMAIL=fashionsrdm@gmail.com
BREVO_SENDER_NAME=RDM Fashions
```

`BREVO_API_KEY` must stay in Supabase Edge Function secrets. Do not put it in frontend JavaScript.

## Deploy

Deploy the function folder:

```text
supabase/functions/send-order-email/
```

The checkout page invokes `send-order-email` after `create_public_order` succeeds.

## Email behavior

Customer receives an order confirmation.
Admin receives a new-order notification.

If an email provider call fails, the order remains created; the checkout page logs the email error and continues to the order-success page.


## IMPORTANT: Order RPC fix
Run `supabase-rpc-fix.sql` (or the full `supabase-setup.sql`) in Supabase SQL Editor. This removes older `create_public_order` overloads, creates the canonical 5-argument RPC, and refreshes the PostgREST schema cache. Then refresh `cart.html`.
