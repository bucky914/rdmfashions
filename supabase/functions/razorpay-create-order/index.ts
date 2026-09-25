const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

function requireEnvironment() {
  const missing = [
    !SUPABASE_URL ? "SUPABASE_URL" : "",
    !SUPABASE_SERVICE_ROLE_KEY ? "SUPABASE_SERVICE_ROLE_KEY" : "",
    !RAZORPAY_KEY_ID ? "RAZORPAY_KEY_ID" : "",
    !RAZORPAY_KEY_SECRET ? "RAZORPAY_KEY_SECRET" : "",
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(`Missing server environment variables: ${missing.join(", ")}`);
  }
}

function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function getOrder(orderId: string) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/orders`);
  url.searchParams.set("id", `eq.${orderId}`);
  url.searchParams.set(
    "select",
    "id,total,status,payment_status,razorpay_order_id",
  );
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Could not read order: ${text}`);
  }

  const orders = await response.json();
  return Array.isArray(orders) ? orders[0] : null;
}

async function saveRazorpayOrderId(
  orderId: string,
  razorpayOrderId: string,
) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/orders`);
  url.searchParams.set("id", `eq.${orderId}`);

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      ...supabaseHeaders(),
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      razorpay_order_id: razorpayOrderId,
      payment_status: "pending",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Could not save Razorpay order: ${text}`);
  }
}

function razorpayAuthHeader() {
  return `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`;
}

async function createRazorpayOrder(amount: number, receipt: string) {
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: razorpayAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount,
      currency: "INR",
      receipt,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      return {
        errorResponse: json(
          { error: "Razorpay authentication failed." },
          401,
        ),
      };
    }

    return {
      errorResponse: json(
        {
          error:
            payload?.error?.description ||
            "Razorpay could not create the payment order.",
        },
        500,
      ),
    };
  }

  return {
    order: payload,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    requireEnvironment();

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.orderId ?? "").trim();

    if (!orderId) {
      return json({ error: "orderId is required." }, 400);
    }

    const order = await getOrder(orderId);

    if (!order) {
      return json({ error: "Order not found." }, 404);
    }

    if (order.payment_status === "paid") {
      return json({ error: "This order has already been paid." }, 409);
    }

    const amount = Math.round(Number(order.total) * 100);

    if (!Number.isInteger(amount) || amount < 100) {
      return json(
        { error: "Order amount must be at least 100 paise." },
        400,
      );
    }

    // Reuse the same Razorpay Order when the customer retries after a
    // dismissal/failure, instead of generating duplicate payment orders.
    if (order.razorpay_order_id) {
      return json({
        key_id: RAZORPAY_KEY_ID,
        order_id: order.razorpay_order_id,
        amount,
        currency: "INR",
      });
    }

    const result = await createRazorpayOrder(amount, `RDM-${orderId}`);

    if (result.errorResponse) {
      return result.errorResponse;
    }

    const razorpayOrder = result.order;

    if (!razorpayOrder?.id) {
      return json(
        { error: "Razorpay returned no order ID." },
        502,
      );
    }

    await saveRazorpayOrderId(orderId, razorpayOrder.id);

    return json({
      key_id: RAZORPAY_KEY_ID,
      order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
    });
  } catch (error) {
    console.error("RAZORPAY CREATE ORDER ERROR:", error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error while creating payment order.",
      },
      500,
    );
  }
});
