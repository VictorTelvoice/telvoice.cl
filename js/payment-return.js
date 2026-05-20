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

  var titleEl = document.getElementById("payment-return-title");
  var textEl = document.getElementById("payment-return-text");
  var metaEl = document.getElementById("payment-return-meta");
  var summaryEl = document.getElementById("payment-order-summary");
  var emailNoteEl = document.getElementById("payment-email-note");

  function setMeta(parts) {
    if (!metaEl || !parts.length) return;
    metaEl.textContent = parts.join(" · ");
    metaEl.hidden = false;
  }

  if (collectionStatus === "approved") {
    if (titleEl) titleEl.textContent = "Pago confirmado";
    if (textEl) {
      textEl.textContent =
        "Mercado Pago aprobó tu pago. Estamos activando tu bolsa SMS.";
    }
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
    var rows = [
      ["Producto", order.plan_name],
      ["SMS incluidos", f.sms ? f.sms + " mensajes" : null],
      ["Neto", f.net],
      ["IVA (19%)", f.tax],
      ["Total", f.total],
      ["Correo", order.customer && order.customer.email],
    ].filter(function (row) {
      return row[1];
    });

    var html =
      "<h2>Resumen de tu compra</h2><dl>" +
      rows
        .map(function (row) {
          var totalClass =
            row[0] === "Total" ? ' class="row row--total"' : ' class="row"';
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

    if (emailNoteEl && order.customer && order.customer.email) {
      emailNoteEl.textContent =
        "Enviaremos el detalle completo a " +
        order.customer.email +
        " en los próximos minutos (revisa spam si no lo ves).";
      emailNoteEl.hidden = false;
    }
  }

  if (!orderRef) return;

  var apiBase = window.location.origin;
  fetch(
    apiBase +
      "/api/orders/summary?order_id=" +
      encodeURIComponent(orderRef)
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
