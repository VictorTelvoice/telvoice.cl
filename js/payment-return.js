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

  var metaEl = document.getElementById("payment-return-meta");
  if (metaEl && (paymentId || orderRef || preferenceId)) {
    var parts = [];
    if (orderRef) parts.push("Orden: " + orderRef);
    if (paymentId) parts.push("Pago MP: " + paymentId);
    metaEl.textContent = parts.join(" · ");
    metaEl.hidden = false;
  }

  var titleEl = document.getElementById("payment-return-title");
  var textEl = document.getElementById("payment-return-text");
  if (!titleEl || !textEl || !collectionStatus) return;

  if (collectionStatus === "approved") {
    titleEl.textContent = "Pago confirmado";
    textEl.textContent =
      "Mercado Pago aprobó tu pago. Estamos activando tu bolsa SMS y te enviaremos la confirmación al correo de la compra.";
    return;
  }

  if (collectionStatus === "pending" || collectionStatus === "in_process") {
    titleEl.textContent = "Pago pendiente";
    textEl.textContent =
      "Tu pago está en proceso. Cuando Mercado Pago lo confirme, activaremos tu bolsa automáticamente.";
    return;
  }

  if (
    collectionStatus === "rejected" ||
    collectionStatus === "failure" ||
    collectionStatus === "cancelled"
  ) {
    titleEl.textContent = "Pago no confirmado";
    textEl.textContent =
      "Mercado Pago no aprobó el pago. Puedes volver a intentarlo desde la sección de precios.";
  }
})();
