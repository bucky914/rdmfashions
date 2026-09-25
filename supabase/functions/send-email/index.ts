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

function requireEnvironment() {
  const missing = [
    !SUPABASE_URL ? "SUPABASE_URL" : "",
    !SUPABASE_SERVICE_ROLE_KEY ? "SUPABASE_SERVICE_ROLE_KEY" : "",
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

async function getPaidOrder(orderId: string) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/orders`);
  url.searchParams.set("id", `eq.${orderId}`);
  url.searchParams.set("payment_status", "eq.paid");
  url.searchParams.set(
    "select",
    "id,customer_name,address,email,phone,quantity,subtotal,delivery_charge,total,status",
  );
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Could not read paid order: ${text}`);
  }

  const orders = await response.json();
  return Array.isArray(orders) ? orders[0] : null;
}

async function getOrderItems(orderId: string) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/order_items`);
  url.searchParams.set("order_id", `eq.${orderId}`);
  url.searchParams.set(
    "select",
    "color,quantity,unit_price,line_total",
  );
  url.searchParams.set("order", "id.asc");

  const response = await fetch(url, {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Could not read order items: ${text}`);
  }

  const items = await response.json();
  return Array.isArray(items) ? items : [];
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

    const order = await getPaidOrder(orderId);

    if (!order) {
      return json(
        { error: "Email can only be sent for a verified paid order." },
        403,
      );
    }

    const items = await getOrderItems(orderId);

    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const adminEmail = Deno.env.get("ADMIN_EMAIL");
    const senderEmail =
      Deno.env.get("BREVO_SENDER_EMAIL") || "fashionsrdm@gmail.com";
    const senderName =
      Deno.env.get("BREVO_SENDER_NAME") || "RDM Fashions";

    if (!brevoApiKey || !adminEmail) {
      return json(
        { error: "BREVO_API_KEY or ADMIN_EMAIL is not configured" },
        500,
      );
    }

    const safeOrderId = escapeHtml(order.id);
    const safeCustomerName = escapeHtml(order.customer_name);
    const safeAddress = escapeHtml(order.address);
    const safeEmail = escapeHtml(order.email);
    const safePhone = escapeHtml(order.phone);

    const totalQty = Number(order.quantity) || items.reduce(
      (sum: number, item: any) => sum + Number(item?.quantity || 0),
      0,
    );

    const itemRows = items.length
      ? items.map((item: any) => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #eee">
              ${escapeHtml(item?.color || "")}
            </td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">
              ${Number(item?.quantity || 0)}
            </td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">
              ₹${Number(item?.line_total || 0).toFixed(2)}
            </td>
          </tr>
        `).join("")
      : `
          <tr>
            <td colspan="3" style="padding:8px">No item details provided</td>
          </tr>
        `;

    const orderDetails = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;max-width:650px;margin:auto">
        <h2>RDM Fashions</h2>
        <p><strong>Order ID:</strong> #${safeOrderId}</p>
        <p><strong>Customer:</strong> ${safeCustomerName}</p>
        <p><strong>Phone:</strong> ${safePhone}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Address:</strong> ${safeAddress}</p>
        <hr>
        <p><strong>Product:</strong> Microfiber All Purpose Cloth · 300 GSM · 60 × 40 cm</p>

        <table style="width:100%;border-collapse:collapse;margin:15px 0">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px">Color</th>
              <th style="text-align:center;padding:8px">Qty</th>
              <th style="text-align:right;padding:8px">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <p><strong>Total quantity:</strong> ${totalQty}</p>
        <p><strong>Subtotal:</strong> ₹${Number(order.subtotal || 0).toFixed(2)}</p>
        <p><strong>Delivery:</strong> ₹${Number(order.delivery_charge || 0).toFixed(2)}</p>
        <p><strong>Total:</strong> ₹${Number(order.total || 0).toFixed(2)}</p>
        <p><strong>Payment status:</strong> Paid</p>
      </div>
    `;

    const sendBrevoEmail = async (
      toEmail: string,
      toName: string,
      subject: string,
      htmlContent: string,
    ) => {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": brevoApiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: senderName,
            email: senderEmail,
          },
          to: [{ email: toEmail, name: toName }],
          subject,
          htmlContent,
        }),
      });

      const result = await response.json().catch(() => ({}));
      console.log(`BREVO ${subject} STATUS:`, response.status);
      console.log(`BREVO ${subject} RESPONSE:`, result);

      return {
        ok: response.ok,
        status: response.status,
        result,
      };
    };

    const customerResult = await sendBrevoEmail(
      order.email,
      order.customer_name,
      `Order #${order.id} Confirmed - RDM Fashions`,
      `
        <div style="font-family:Arial,sans-serif;line-height:1.6">
          <h2>Order Confirmed</h2>
          <p>Hi ${safeCustomerName},</p>
          <p>Your payment was received and order <strong>#${safeOrderId}</strong> is confirmed.</p>
          ${orderDetails}
          <p>We will update you when your order is shipped.</p>
        </div>
      `,
    );

    if (!customerResult.ok) {
      return json({
        error: "Customer email failed",
        customer: customerResult.result,
      }, 502);
    }

    const adminResult = await sendBrevoEmail(
      adminEmail,
      "Admin",
      `Paid Order #${order.id} - RDM Fashions`,
      `
        <div style="font-family:Arial,sans-serif;line-height:1.6">
          <h2>Paid Order Received</h2>
          ${orderDetails}
          <p><strong>Order status:</strong> ${escapeHtml(order.status)}</p>
        </div>
      `,
    );

    if (!adminResult.ok) {
      return json({
        error: "Admin email failed",
        customerMessageId: customerResult.result?.messageId ?? null,
        admin: adminResult.result,
      }, 502);
    }

    return json({
      success: true,
      customerMessageId: customerResult.result?.messageId ?? null,
      adminMessageId: adminResult.result?.messageId ?? null,
    });
  } catch (error) {
    console.error("EMAIL FUNCTION ERROR:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      500,
    );
  }
});

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
