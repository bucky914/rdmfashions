const imageForColor = color => ({
  "Light Brown": "assets/microfiber-cloth.jpg",
  "Dusty Pink": "assets/microfiber-cloth-dusty-pink.jpg",
  "Slate Blue": "assets/microfiber-cloth-slate-blue.jpg"
}[color] || "assets/microfiber-cloth.jpg");

document.addEventListener("DOMContentLoaded", async () => {
  const list = document.querySelector("#history-list");
  const message = document.querySelector("#history-message");
  const history = getOrderHistory();

  if (!history.length) {
    list.innerHTML = `
      <div class="empty-state">
        <p>No orders found on this browser yet.</p>
        <a class="button" href="index.html">Shop Now</a>
      </div>`;
    return;
  }

  const renderItemLines = order => {
    const items = Array.isArray(order.items) && order.items.length
      ? order.items
      : [{
          color: order.color || "Light Brown",
          quantity: order.quantity || 0,
          line_total: Number(order.subtotal || 0)
        }];

    return items.map(item => `
      <div class="history-variant">
        <img src="${imageForColor(item.color)}" alt="${item.color}">
        <div>
          <strong>Microfiber All Purpose Cloth</strong>
          <span>${item.color} · ${PRODUCT.gsm} · ${PRODUCT.size}</span>
        </div>
        <span>${item.quantity} × ${formatMoney(item.unit_price || PRODUCT.price)} = ${formatMoney(item.line_total || (PRODUCT.price * item.quantity))}</span>
      </div>
    `).join("");
  };

  list.innerHTML = history.map(o => `
    <article class="history-card" data-id="${o.id}">
      <div class="history-card__top">
        <div>
          <p class="eyebrow">Order</p>
          <h2>#${o.id}</h2>
          <p class="muted">${new Date(o.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
        </div>
        <strong class="history-status">${o.status || "Ordered"}</strong>
      </div>
      <div class="history-card__body history-card__body--variants">
        <div class="history-variants">${renderItemLines(o)}</div>
        <div class="history-summary">
          <span><small>Quantity</small><strong>${o.quantity}</strong></span>
          <span><small>Total</small><strong>${formatMoney(o.total)}</strong></span>
        </div>
      </div>
    </article>
  `).join("");

  try {
    const ids = history.map(o => o.id);
    const { data, error } = await supabaseClient.rpc("get_public_order_history", {
      p_order_ids: ids
    });

    if (error) throw error;

    const latestById = new Map((data || []).map(o => [o.id, o]));

    history.forEach(o => {
      const latest = latestById.get(o.id);
      if (!latest) return;

      o.status = latest.status;
      o.quantity = latest.quantity;
      o.subtotal = latest.subtotal;
      o.delivery = latest.delivery_charge;
      o.total = latest.total;
      o.items = latest.items || o.items;
    });

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));

    document.querySelectorAll(".history-card").forEach(card => {
      const latest = latestById.get(card.dataset.id);
      if (!latest) return;

      const status = card.querySelector(".history-status");
      if (status) status.textContent = latest.status;
    });
  } catch (err) {
    message.textContent =
      "Order history is shown from this browser. Live status could not be refreshed.";
    console.warn(err);
  }
});
