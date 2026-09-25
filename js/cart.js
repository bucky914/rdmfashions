function getPricing(itemsOrQuantity) {
  const quantity = Array.isArray(itemsOrQuantity)
    ? itemsOrQuantity.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    : Number(itemsOrQuantity || 0);

  const subtotal = PRODUCT.price * quantity;
  // Delivery: ₹40 for the first item, then +₹20 for each additional item.
  const delivery = quantity > 0 ? 40 + (quantity - 1) * 20 : 0;

  return {
    subtotal,
    delivery,
    total: subtotal + delivery
  };
}

function colorImage(color) {
  return {
    "Light Brown": "assets/microfiber-cloth.jpg",
    "Dusty Pink": "assets/microfiber-cloth-dusty-pink.jpg",
    "Slate Blue": "assets/microfiber-cloth-slate-blue.jpg"
  }[color] || "assets/microfiber-cloth.jpg";
}

function cartItemKey(item) {
  return `${item.product_id}::${item.color}`;
}

function renderCart() {
  const items = getCartItems();
  const totalQuantity = getCartQuantity();
  const pricing = getPricing(items);

  const empty = document.querySelector("#empty-cart");
  const content = document.querySelector("#cart-content");
  const itemsWrap = document.querySelector("#cart-items");
  const checkoutFormSection = document.querySelector(".checkout-form");

  if (!empty || !content || !itemsWrap) return;

  empty.hidden = items.length > 0;
  content.hidden = items.length === 0;

  if (!items.length) {
    itemsWrap.innerHTML = "";
    if (checkoutFormSection) checkoutFormSection.hidden = true;

    const invoiceQuantity = document.querySelector(".invoice-quantity");
    const subtotal = document.querySelector(".subtotal");
    const delivery = document.querySelector(".delivery");
    const totalValue = document.querySelector(".total-value");

    if (invoiceQuantity) invoiceQuantity.textContent = "0";
    if (subtotal) subtotal.textContent = "₹0";
    if (delivery) delivery.textContent = "₹0";
    if (totalValue) totalValue.textContent = "₹0";

    updateCartCount();
    return;
  }

  if (checkoutFormSection) checkoutFormSection.hidden = false;

  itemsWrap.innerHTML = items.map(item => {
    const key = encodeURIComponent(cartItemKey(item));

    return `
      <article class="cart-item variant-cart-item" data-cart-key="${key}">
        <img
          src="${colorImage(item.color)}"
          alt="${item.color} Microfiber All Purpose Cloth"
        >

        <div class="cart-item-details">
          <h2>${PRODUCT.name}</h2>
          <p class="muted">
            <span class="cart-color">${item.color}</span>
            · ${PRODUCT.gsm} · ${PRODUCT.size}
          </p>
          <p class="price">
            ${formatMoney(item.price * item.quantity)}
          </p>
        </div>

        <div class="cart-item-controls">
          <div class="stepper">
            <button
              type="button"
              data-cart-action="minus"
              data-cart-key="${key}"
              aria-label="Decrease ${item.color} quantity"
            >−</button>

            <strong class="cart-quantity">${item.quantity}</strong>

            <button
              type="button"
              data-cart-action="plus"
              data-cart-key="${key}"
              aria-label="Increase ${item.color} quantity"
            >+</button>
          </div>

          <button
            type="button"
            class="remove-item"
            data-cart-action="remove"
            data-cart-key="${key}"
          >
            Remove
          </button>
        </div>
      </article>
    `;
  }).join("");

  const invoiceQuantity = document.querySelector(".invoice-quantity");
  const invoicePrice = document.querySelector(".invoice-price");
  const subtotal = document.querySelector(".subtotal");
  const delivery = document.querySelector(".delivery");
  const totalValue = document.querySelector(".total-value");

  if (invoicePrice) invoicePrice.textContent = formatMoney(PRODUCT.price);
  if (invoiceQuantity) invoiceQuantity.textContent = totalQuantity;
  if (subtotal) subtotal.textContent = formatMoney(pricing.subtotal);
  if (delivery) delivery.textContent = formatMoney(pricing.delivery);
  if (totalValue) totalValue.textContent = formatMoney(pricing.total);

  updateCartCount();
}

// Event delegation keeps the controls working after every cart re-render.
document.addEventListener("click", event => {
  const button = event.target.closest("[data-cart-action]");
  if (!button) return;

  // Never let cart controls submit the checkout form.
  event.preventDefault();

  const action = button.dataset.cartAction;
  const encodedKey = button.dataset.cartKey;
  if (!action || !encodedKey) return;

  let key;
  try {
    key = decodeURIComponent(encodedKey);
  } catch {
    return;
  }

  const items = getCartItems();
  const index = items.findIndex(item => cartItemKey(item) === key);

  if (index === -1) return;

  if (action === "plus") {
    items[index].quantity += 1;
    saveCartItems(items);
  } else if (action === "minus") {
    items[index].quantity -= 1;

    if (items[index].quantity <= 0) {
      items.splice(index, 1);
    }

    saveCartItems(items);
  } else if (action === "remove") {
    // Remove ONLY this color variant.
    items.splice(index, 1);
    saveCartItems(items);
  } else {
    return;
  }

  renderCart();
});

document.addEventListener("DOMContentLoaded", renderCart);
