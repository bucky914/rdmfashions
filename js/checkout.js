document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("#checkout-form");
  if (!form) return;

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const message = form.querySelector(".form-message");
    const button = form.querySelector("button[type='submit']");
    const data = Object.fromEntries(new FormData(form));
    const items = getCartItems();

    if (!form.checkValidity()) {
      message.textContent = "Please complete all customer details correctly.";
      form.reportValidity();
      return;
    }

    if (!items.length) {
      message.textContent = "Your cart is empty. Add a product before checking out.";
      return;
    }

    if (
      SUPABASE_URL.includes("YOUR_") ||
      SUPABASE_ANON_KEY.includes("YOUR_")
    ) {
      message.textContent =
        "Store setup is incomplete. Add your Supabase URL and anon key in js/config.js.";
      return;
    }

    if (typeof Razorpay === "undefined") {
      message.textContent =
        "Payment checkout could not load. Please refresh the page and try again.";
      return;
    }

    const pricing = getPricing(items);
    const orderItems = items.map(item => ({
      product_id: item.product_id,
      product_name: PRODUCT.name,
      color: item.color,
      quantity: item.quantity,
      unit_price: PRODUCT.price,
      line_total: PRODUCT.price * item.quantity
    }));

    button.disabled = true;
    button.textContent = "Preparing payment…";
    message.textContent = "";

    try {
      let localOrderId =
        sessionStorage.getItem("rdmPendingPaymentOrderId") || "";

      if (!localOrderId) {
        const {
          data: order,
          error: orderError
        } = await supabaseClient.rpc("create_public_order", {
          p_customer_name: data.fullName,
          p_address: data.address,
          p_email: data.email,
          p_phone: data.phone,
          p_items: orderItems
        });

        if (orderError) throw orderError;

        const saved = Array.isArray(order) ? order[0] : order;
        if (!saved?.id) {
          throw new Error("Order was created but no order ID was returned.");
        }

        localOrderId = saved.id;
        sessionStorage.setItem("rdmPendingPaymentOrderId", localOrderId);
      }

      const {
        data: paymentOrder,
        error: paymentOrderError
      } = await supabaseClient.functions.invoke(
        "razorpay-create-order",
        {
          body: { orderId: localOrderId }
        }
      );

      if (paymentOrderError) {
        throw new Error(
          paymentOrderError.message || "Could not create the Razorpay order."
        );
      }

      if (!paymentOrder?.order_id || !paymentOrder?.key_id) {
        throw new Error("Razorpay did not return a valid payment order.");
      }

      button.textContent = "Opening payment…";

      const razorpayOptions = {
        key: paymentOrder.key_id,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency || "INR",
        name: "RDM Fashions",
        description: "Microfiber All Purpose Cloth",
        order_id: paymentOrder.order_id,
        prefill: {
          name: data.fullName,
          email: data.email,
          contact: data.phone
        },
        notes: {
          order_id: localOrderId,
          address: data.address
        },
        theme: {
          color: "#111111"
        },
        modal: {
          escape: true,
          confirm_close: true,
          ondismiss: () => {
            message.textContent =
              "Payment was cancelled. Your order is still pending and you can retry the payment.";
            button.disabled = false;
            button.textContent = "Pay & Place Order";
          }
        },
        handler: async response => {
          button.disabled = true;
          button.textContent = "Verifying payment…";
          message.textContent = "";

          try {
            const {
              data: verification,
              error: verificationError
            } = await supabaseClient.functions.invoke(
              "razorpay-verify-payment",
              {
                body: {
                  orderId: localOrderId,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature
                }
              }
            );

            if (verificationError) {
              throw new Error(
                verificationError.message || "Payment verification failed."
              );
            }

            if (!verification?.success || verification?.status !== "paid") {
              throw new Error(
                verification?.error || "Payment could not be confirmed."
              );
            }

            const historyItem = {
              id: localOrderId,
              items: orderItems,
              quantity: items.reduce((sum, item) => sum + item.quantity, 0),
              subtotal: pricing.subtotal,
              delivery: pricing.delivery,
              total: pricing.total,
              created_at: new Date().toISOString(),
              status: "Confirmed",
              payment_status: "paid",
              razorpay_payment_id: response.razorpay_payment_id
            };

            saveOrderToHistory(historyItem);
            sessionStorage.setItem(
              "rdmLastOrder",
              JSON.stringify({
                ...historyItem,
                email: data.email
              })
            );

            // Email delivery is a post-payment notification. A failure here
            // must not turn a successful payment into a failed order.
            const {
              error: emailError
            } = await supabaseClient.functions.invoke("send-email", {
              body: {
                orderId: localOrderId
              }
            });

            if (emailError) {
              console.error("EMAIL ERROR AFTER PAYMENT:", emailError);
            }

            sessionStorage.removeItem("rdmPendingPaymentOrderId");
            clearCart();

            message.textContent = emailError
              ? "Payment successful. Your order is confirmed, but the confirmation email could not be sent."
              : "Payment successful. Your order is confirmed.";

            button.textContent = "Payment Successful";

            setTimeout(() => {
              location.href = "order-success.html";
            }, 800);
          } catch (verificationErr) {
            console.error("PAYMENT VERIFICATION ERROR:", verificationErr);
            message.textContent =
              `Payment could not be confirmed. ${
                verificationErr?.message || "Please check your payment status."
              }`;
            button.disabled = false;
            button.textContent = "Pay & Place Order";
          }
        }
      };

      const razorpay = new Razorpay(razorpayOptions);

      razorpay.on("payment.failed", response => {
        const description =
          response?.error?.description || "The payment was not successful.";

        console.error("RAZORPAY PAYMENT FAILED:", response);
        message.textContent =
          `${description} You can retry the payment.`;

        button.disabled = false;
        button.textContent = "Pay & Place Order";
      });

      razorpay.open();
    } catch (err) {
      console.error("CHECKOUT ERROR:", err);
      message.textContent =
        `Could not start payment. ${err?.message || "Please try again."}`;
      button.disabled = false;
      button.textContent = "Pay & Place Order";
    }
  });
});
