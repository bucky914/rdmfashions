const CART_KEY = "rdmCartItems";
const LEGACY_QTY_KEY = "rdmCartQuantity";
const LEGACY_COLOR_KEY = "rdmCartColor";
const HISTORY_KEY = "rdmOrderHistory";

const normalizeColor = (color) =>
  PRODUCT.colors.includes(color) ? color : PRODUCT.colors[0];

function getCartItems() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || "null");

    if (Array.isArray(raw)) {
      return raw
        .filter(item => item && PRODUCT.colors.includes(item.color) && Number(item.quantity) > 0)
        .map(item => ({
          product_id: item.product_id || "microfiber-cloth",
          product_name: PRODUCT.name,
          color: normalizeColor(item.color),
          quantity: Math.max(1, Math.floor(Number(item.quantity))),
          price: Number(item.price) || PRODUCT.price
        }));
    }

    // One-time migration from the old single-quantity cart.
    const legacyQty = Math.max(0, Math.floor(Number(localStorage.getItem(LEGACY_QTY_KEY) || 0)));
    if (legacyQty > 0) {
      return [{
        product_id: "microfiber-cloth",
        product_name: PRODUCT.name,
        color: normalizeColor(localStorage.getItem(LEGACY_COLOR_KEY)),
        quantity: legacyQty,
        price: PRODUCT.price
      }];
    }
  } catch {}

  return [];
}

function saveCartItems(items) {
  const clean = items
    .filter(item => item && PRODUCT.colors.includes(item.color) && Number(item.quantity) > 0)
    .map(item => ({
      product_id: item.product_id || "microfiber-cloth",
      product_name: PRODUCT.name,
      color: normalizeColor(item.color),
      quantity: Math.max(1, Math.floor(Number(item.quantity))),
      price: Number(item.price) || PRODUCT.price
    }));

  localStorage.setItem(CART_KEY, JSON.stringify(clean));
  localStorage.removeItem(LEGACY_QTY_KEY);
  localStorage.removeItem(LEGACY_COLOR_KEY);
  updateCartCount();
}

function addToCart(color, quantity = 1) {
  color = normalizeColor(color);
  quantity = Math.max(1, Math.floor(Number(quantity)));

  const items = getCartItems();
  const existing = items.find(
    item => item.product_id === "microfiber-cloth" && item.color === color
  );

  if (existing) {
    existing.quantity += quantity;
  } else {
    items.push({
      product_id: "microfiber-cloth",
      product_name: PRODUCT.name,
      color,
      quantity,
      price: PRODUCT.price
    });
  }

  saveCartItems(items);
  return items;
}

function updateCartItem(color, quantity) {
  const items = getCartItems();
  const item = items.find(i => i.product_id === "microfiber-cloth" && i.color === color);

  if (!item) return items;

  quantity = Math.floor(Number(quantity));
  if (quantity <= 0) {
    return removeCartItem(color);
  }

  item.quantity = quantity;
  saveCartItems(items);
  return items;
}

function removeCartItem(color) {
  const items = getCartItems().filter(
    item => !(item.product_id === "microfiber-cloth" && item.color === color)
  );
  saveCartItems(items);
  return items;
}

function getCartQuantity() {
  return getCartItems().reduce((sum, item) => sum + item.quantity, 0);
}

function getCartColor() {
  const items = getCartItems();
  return items[0]?.color || PRODUCT.colors[0];
}

function setCartColor(color) {
  if (PRODUCT.colors.includes(color)) {
    sessionStorage.setItem("rdmSelectedColor", color);
  }
}

function getSelectedColor() {
  return normalizeColor(
    sessionStorage.getItem("rdmSelectedColor") || PRODUCT.colors[0]
  );
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
  localStorage.removeItem(LEGACY_QTY_KEY);
  localStorage.removeItem(LEGACY_COLOR_KEY);
  updateCartCount();
}

function formatMoney(n) {
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

function getOrderHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveOrderToHistory(order) {
  const history = getOrderHistory().filter(o => o.id !== order.id);
  history.unshift(order);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
}

function updateCartCount() {
  document.querySelectorAll(".cart-count").forEach(e => {
    e.textContent = getCartQuantity();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  updateCartCount();
  document.querySelectorAll(".year").forEach(e => {
    e.textContent = new Date().getFullYear();
  });

  document.querySelectorAll(".buy-now[data-color]").forEach(button => {
    button.addEventListener("click", () => {
      const color = normalizeColor(button.dataset.color);
      addToCart(color, 1);
      setCartColor(color);
      location.href = "cart.html";
    });
  });
});
