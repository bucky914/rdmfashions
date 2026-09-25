document.addEventListener("DOMContentLoaded", () => {
  let quantity = 1;

  const value = document.querySelector(".quantity-value");
  const image = document.querySelector("#product-image");
  const colorInputs = [...document.querySelectorAll('[name="product-color"]')];
  const colorOptions = [...document.querySelectorAll(".color-option")];
  const colorGroup = document.querySelector("#product-color-options");
  const colorRow = colorGroup?.closest("dl > div");
  const minus = document.querySelector('[data-action="minus"]');
  const plus = document.querySelector('[data-action="plus"]');
  const addButton = document.querySelector("#add-cart");
  const buyButton = document.querySelector("#buy-now");

  const colorImages = {
    "Light Brown": "assets/microfiber-cloth.jpg",
    "Dusty Pink": "assets/microfiber-cloth-dusty-pink.jpg",
    "Slate Blue": "assets/microfiber-cloth-slate-blue.jpg"
  };

  const params = new URLSearchParams(window.location.search);
  const urlColor = params.get("color");
  const hasLockedColor = PRODUCT.colors.includes(urlColor);
  let color = hasLockedColor ? urlColor : getSelectedColor();

  // When the page is opened from the homepage with a color query,
  // show ONLY that color variant. Do not rely on the HTML hidden
  // attribute because site CSS can override its display behavior.
  if (hasLockedColor) {
    colorOptions.forEach(option => {
      const input = option.querySelector('input[name="product-color"]');
      const isSelected = input && input.value === color;

      option.style.display = isSelected ? "inline-flex" : "none";

      if (input) {
        input.checked = isSelected;
        input.disabled = !isSelected;
      }
    });

    setCartColor(color);
  } else {
    colorOptions.forEach(option => {
      option.style.display = "inline-flex";
      const input = option.querySelector('input[name="product-color"]');
      if (input) input.disabled = false;
    });
  }

  const render = () => {
    if (value) value.textContent = quantity;

    colorInputs.forEach(input => {
      input.checked = input.value === color;
      if (hasLockedColor) {
        input.disabled = input.value !== color;
      } else {
        input.disabled = false;
      }
    });

    if (image && colorImages[color]) {
      image.src = colorImages[color];
      image.alt = `${color} Microfiber All Purpose Cloth`;
    }
  };

  if (minus) {
    minus.type = "button";
    minus.onclick = () => {
      quantity = Math.max(1, quantity - 1);
      render();
    };
  }

  if (plus) {
    plus.type = "button";
    plus.onclick = () => {
      quantity += 1;
      render();
    };
  }

  colorInputs.forEach(input => {
    input.addEventListener("change", () => {
      if (hasLockedColor) return;

      color = normalizeColor(input.value);
      setCartColor(color);
      render();
    });
  });

  const addSelectedVariant = () => {
    setCartColor(color);
    addToCart(color, quantity);
  };

  if (addButton) {
    addButton.type = "button";
    addButton.onclick = () => {
      addSelectedVariant();
      alert(`${color} × ${quantity} added to cart.`);
    };
  }

  if (buyButton) {
    buyButton.type = "button";
    buyButton.onclick = () => {
      addSelectedVariant();
      location.href = "cart.html";
    };
  }

  render();
});
