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

async function markPayment(
  orderId: string,
  paymentStatus: "authorized" | "paid" | "failed",
  paymentId: string,
  signature: string,
  shouldConfirmOrder: boolean,
) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/orders`);
  url.searchParams.set("id", `eq.${orderId}`);

  const patch: Record<string, string> = {
    payment_status: paymentStatus,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  };

  if (shouldConfirmOrder) {
    patch.status = "Confirmed";
  }

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      ...supabaseHeaders(),
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Could not update payment status: ${text}`);
  }
}

async function hmacSha256Hex(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );

  return Array.from(new Uint8Array(signature))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;

  let difference = 0;

  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return difference === 0;
}

function razorpayAuthHeader() {
  return `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`;
}

async function fetchPayment(paymentId: string) {
  const response = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: {
        Authorization: razorpayAuthHeader(),
      },
    },
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      return {
        errorResponse: json(
          { error: "Razorpay authentication failed." },
          502,
        ),
      };
    }

    return {
      errorResponse: json(
        {
          error:
            payload?.error?.description ||
            "Could not fetch the Razorpay payment.",
        },
        502,
      ),
    };
  }

  return { payment: payload };
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
    const razorpayOrderId = String(body?.razorpay_order_id ?? "").trim();
    const razorpayPaymentId = String(body?.razorpay_payment_id ?? "").trim();
    const razorpaySignature = String(body?.razorpay_signature ?? "").trim();

    if (
      !orderId ||
      !razorpayOrderId ||
      !razorpayPaymentId ||
      !razorpaySignature
    ) {
      return json(
        {
          error:
            "orderId, razorpay_order_id, razorpay_payment_id and razorpay_signature are required.",
        },
        400,
      );
    }

    const order = await getOrder(orderId);

    if (!order) {
      return json({ error: "Order not found." }, 404);
    }

    if (!order.razorpay_order_id) {
      return json(
        { error: "No Razorpay order is associated with this order." },
        400,
      );
    }

    if (order.razorpay_order_id !== razorpayOrderId) {
      return json(
        { error: "Razorpay order ID does not match the server record." },
        400,
      );
    }

    if (order.payment_status === "paid") {
      return json({
        success: true,
        status: "paid",
        payment_id: order.razorpay_payment_id,
        message: "Payment was already verified.",
      });
    }

    const expectedSignature = await hmacSha256Hex(
      `${order.razorpay_order_id}|${razorpayPaymentId}`,
      RAZORPAY_KEY_SECRET,
    );

    if (!safeEqual(expectedSignature, razorpaySignature)) {
      return json(
        {
          success: false,
          error: "Payment signature verification failed.",
        },
        400,
      );
    }

    const expectedAmount = Math.round(Number(order.total) * 100);
    const paymentResult = await fetchPayment(razorpayPaymentId);

    if (paymentResult.errorResponse) {
      return paymentResult.errorResponse;
    }

    const payment = paymentResult.payment;

    if (payment?.order_id !== order.razorpay_order_id) {
      return json(
        { error: "Payment is not linked to the expected Razorpay order." },
        400,
      );
    }

    if (Number(payment?.amount) !== expectedAmount) {
      return json(
        { error: "Payment amount does not match the order amount." },
        400,
      );
    }

    if (payment?.currency !== "INR") {
      return json(
        { error: "Unexpected payment currency." },
        400,
      );
    }

    if (payment?.status === "captured") {
      await markPayment(
        orderId,
        "paid",
        razorpayPaymentId,
        razorpaySignature,
        true,
      );

      return json({
        success: true,
        status: "paid",
        payment_id: razorpayPaymentId,
        message: "Payment verified and captured.",
      });
    }

    if (payment?.status === "authorized") {
      await markPayment(
        orderId,
        "authorized",
        razorpayPaymentId,
        razorpaySignature,
        false,
      );

      return json(
        {
          success: false,
          status: "authorized",
          error:
            "Payment was authorized but is not captured yet. Enable Razorpay auto-capture or capture the payment before fulfilling this order.",
        },
        202,
      );
    }

    await markPayment(
      orderId,
      "failed",
      razorpayPaymentId,
      razorpaySignature,
      false,
    );

    return json(
      {
        success: false,
        status: String(payment?.status ?? "unknown"),
        error: "Payment was not captured.",
      },
      400,
    );
  } catch (error) {
    console.error("RAZORPAY VERIFY PAYMENT ERROR:", error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error while verifying payment.",
      },
      500,
    );
  }
});
