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
    } else if (emailNoteEl && customerEmail) {
      emailNoteEl.textContent =
        "Te enviaremos novedades a " +
        customerEmail +
        " cuando confirmemos el pago.";
      emailNoteEl.hidden = false;
    }
  }

  if (!orderRef) return;

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
      }
    })
    .catch(function () {
      /* resumen opcional */
    });
})();
