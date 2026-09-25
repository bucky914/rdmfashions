# Razorpay Standard Checkout Setup

This project is a static HTML/CSS/JavaScript storefront backed by Supabase. The payment backend is implemented with Supabase Edge Functions.

## 1. Supabase database

Run:

- `razorpay-payment-migration.sql`

This adds payment fields to the existing `orders` table.

## 2. Supabase secrets

Do not put the Razorpay secret in browser JavaScript or commit it to Git.

Set the Test Mode credentials as Supabase secrets:

```bash
supabase secrets set RAZORPAY_KEY_ID=rzp_test_your_key_id
supabase secrets set RAZORPAY_KEY_SECRET=your_razorpay_test_key_secret
```

Supabase Edge Functions already provide the project values `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` at runtime.

## 3. Deploy Edge Functions

Deploy:

```bash
supabase functions deploy razorpay-create-order
supabase functions deploy razorpay-verify-payment
supabase functions deploy send-email
```

## 4. Frontend behavior

The checkout page:

1. Creates the shopping order in Supabase using the existing server-side pricing RPC.
2. Calls `razorpay-create-order` with the Supabase order ID.
3. Opens Razorpay Standard Checkout.
4. Sends `razorpay_payment_id`, `razorpay_order_id`, and `razorpay_signature` to `razorpay-verify-payment`.
5. The server validates the signature using HMAC-SHA256 and checks the Razorpay payment amount/order/currency.
6. Only a captured payment changes the order to `Confirmed` and `payment_status = paid`.
7. The existing email function sends confirmation only for paid orders.

## 5. Test Mode

Use Razorpay Test Mode keys. In the Razorpay test checkout, `success@razorpay` can be used for a successful UPI test and `failure@razorpay` for a failed UPI test. Test cards are also available in Razorpay's Standard Checkout documentation.

## 6. Live mode

After the complete test flow works, switch the Razorpay Dashboard to Live Mode and generate Live API keys. Replace the Supabase secrets with the Live credentials. Never place the Live secret in frontend code.

## Important

The distributable project intentionally does not contain the real Razorpay secret. `.env.example` is provided as a template. For this static + Supabase architecture, Supabase Edge Function secrets are the correct production secret store.
