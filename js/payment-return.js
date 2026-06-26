(function () {
  var params = new URLSearchParams(window.location.search);
  var collectionStatus = (
    params.get("collection_status") ||
    params.get("status") ||
    ""
  ).toLowerCase();
  var paymentId = params.get("payment_id") || "";
  var orderRef = params.get("external_reference") || "";
  var preferenceId = params.get("preference_id") || "";

  var cardEl = document.getElementById("payment-card");
  var titleEl = document.getElementById("payment-return-title");
  var textEl = document.getElementById("payment-return-text");
  var metaEl = document.getElementById("payment-return-meta");
  var summaryEl = document.getElementById("payment-order-summary");
  var accountBoxEl = document.getElementById("payment-account-box");
  var emailNoteEl = document.getElementById("payment-email-note");
  var tutorialBtn = document.getElementById("payment-tutorial-btn");

  var isApproved = collectionStatus === "approved";
  var purchaseTracked = false;

  function trackPurchase(order) {
    if (purchaseTracked || !isApproved) return;
    purchaseTracked = true;

    var mp = (order && order.mercadopago) || {};
    var customer = (order && order.customer) || {};
    var transactionId =
      mp.payment_id || paymentId || (order && order.order_id) || orderRef || preferenceId;

    var payload = {
      transaction_id: transactionId ? String(transactionId) : null,
      value: order && order.total_amount != null ? order.total_amount : null,
      currency: (order && order.currency) || "CLP",
      sms_quantity: order && order.sms_quantity != null ? order.sms_quantity : null,
    };

    if (customer.email) {
      payload.buyer_email = customer.email;
      payload.user_data = { email: customer.email };
    }

    if (typeof window.TelvoiceTrack === "function") {
      window.TelvoiceTrack("purchase_success", payload);
    } else {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: "purchase_success" }, payload));
    }
  }

  function setMeta(parts) {
    if (!metaEl || !parts.length) return;
    metaEl.textContent = parts.join(" · ");
    metaEl.hidden = false;
  }

  function showAccountProvisioning(email) {
    if (accountBoxEl) accountBoxEl.hidden = false;
    if (cardEl) cardEl.classList.add("payment-card--confirm");
    document.body.classList.add("payment-page--confirm");

    if (titleEl) titleEl.textContent = "¡Compra confirmada!";
    if (textEl) {
      textEl.textContent =
        "Mercado Pago aprobó tu pago. Para usar tus SMS, activa tu cuenta con Google usando el mismo correo con el que compraste.";
    }

    if (emailNoteEl) {
      var mail = email || "el correo que ingresaste al comprar";
      emailNoteEl.textContent =
        "Recibirás en " +
        mail +
        " un correo de Telvoice con el botón para activar tu cuenta con Google. Revisa también la carpeta de spam.";
      emailNoteEl.hidden = false;
    }

    if (tutorialBtn) tutorialBtn.hidden = false;
  }

  if (isApproved) {
    showAccountProvisioning(null);
  } else if (
    collectionStatus === "pending" ||
    collectionStatus === "in_process"
  ) {
    if (titleEl) titleEl.textContent = "Pago pendiente";
    if (textEl) {
      textEl.textContent =
        "Tu pago está en proceso. Cuando Mercado Pago lo confirme, activaremos tu bolsa automáticamente.";
    }
  } else if (
    collectionStatus === "rejected" ||
    collectionStatus === "failure" ||
    collectionStatus === "cancelled"
  ) {
    if (titleEl) titleEl.textContent = "Pago no confirmado";
    if (textEl) {
      textEl.textContent =
        "Mercado Pago no aprobó el pago. Puedes volver a intentarlo desde la sección de precios.";
    }
  } else if (
    !collectionStatus ||
    collectionStatus === "null" ||
    (!paymentId && !preferenceId && orderRef)
  ) {
    /* Volver a la tienda sin completar pago: params null — no es error de cobro */
    if (titleEl) titleEl.textContent = "No se completó el pago";
    if (textEl) {
      textEl.textContent =
        "Tu compra no fue cobrada. Puedes volver al inicio e intentar nuevamente cuando quieras.";
    }
  }

  var metaParts = [];
  if (orderRef) metaParts.push("Orden: " + orderRef);
  if (paymentId) metaParts.push("Pago MP: " + paymentId);
  if (!paymentId && preferenceId) metaParts.push("Preferencia: " + preferenceId);
  setMeta(metaParts);

  function renderSummary(order) {
    if (!summaryEl || !order) return;
    var f = order.formatted || {};
    var customerEmail = order.customer && order.customer.email;

    var rows = [
      ["Producto", order.plan_name],
      ["SMS incluidos", f.sms ? f.sms + " mensajes" : null],
      ["Neto", f.net],
      ["IVA (19%)", f.tax],
      ["Total pagado", f.total],
      ["Correo de compra", customerEmail],
    ].filter(function (row) {
      return row[1];
    });

    var html =
      "<h2>Lo que compraste</h2><dl>" +
      rows
        .map(function (row) {
          var totalClass =
            row[0] === "Total pagado"
              ? ' class="row row--total"'
              : ' class="row"';
          return (
            "<div" +
            totalClass +
            "><dt>" +
            row[0] +
            "</dt><dd>" +
            row[1] +
            "</dd></div>"
          );
        })
        .join("") +
      "</dl>";

    summaryEl.innerHTML = html;
    summaryEl.hidden = false;

    if (isApproved) {
      showAccountProvisioning(customerEmail);
      trackPurchase(order);
    } else if (emailNoteEl && customerEmail) {
      emailNoteEl.textContent =
        "Te enviaremos novedades a " +
        customerEmail +
        " cuando confirmemos el pago.";
      emailNoteEl.hidden = false;
    }
  }

  if (!orderRef) {
    if (isApproved && paymentId) {
      trackPurchase(null);
    }
    return;
  }

  var apiBase = window.location.origin;
  fetch(
    apiBase + "/api/orders/summary?order_id=" + encodeURIComponent(orderRef)
  )
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (data && data.ok && data.order) {
        renderSummary(data.order);
      } else if (isApproved) {
        trackPurchase(null);
      }
    })
    .catch(function () {
      if (isApproved) trackPurchase(null);
    });
})();
