(function () {
  var CFG = window.TELVOICE_CONFIG || {};
  var SALES_EMAIL = CFG.salesEmail || "ventas@telvoice.net";
  var IVA_RATE = CFG.ivaRate != null ? CFG.ivaRate : 0.19;
  var QUOTE_MIN = CFG.quoteVolumeMin != null ? CFG.quoteVolumeMin : 200000;
  var BAGS = CFG.bags || [];

  function qs(id) {
    return document.getElementById(id);
  }

  function fmt(n) {
    return new Intl.NumberFormat("es-CL").format(Math.round(n));
  }

  function trackEvent(name, detail) {
    if (!name) return;
    if (typeof window.gtag === "function") {
      window.gtag("event", name, detail || {});
    }
    if (typeof window.dataLayer !== "undefined") {
      window.dataLayer.push(Object.assign({ event: name }, detail || {}));
    }
    if (typeof window.TelvoiceTrack === "function") {
      window.TelvoiceTrack(name, detail);
    }
  }

  window.TelvoiceTrack = trackEvent;

  function whatsappUrl(customMessage) {
    var wa = CFG.whatsapp || {};
    var num = (wa.number || "").replace(/\D/g, "");
    if (!num) return null;
    var text = encodeURIComponent(customMessage || wa.message || "Hola, quiero cotizar una bolsa de SMS para Chile.");
    return "https://wa.me/" + num + "?text=" + text;
  }

  function bindWhatsappLinks() {
    var url = whatsappUrl();
    document.querySelectorAll(".wa-inline-cta, .wa-section-cta").forEach(function (el) {
      if (url) {
        el.href = url;
        el.target = "_blank";
        el.rel = "noopener noreferrer";
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    });
    var floatBtn = qs("wa-float");
    if (floatBtn && url) {
      floatBtn.href = url;
      floatBtn.addEventListener("click", function () {
        trackEvent("click_whatsapp", { placement: "float" });
      });
    } else if (floatBtn) {
      floatBtn.hidden = true;
    }
  }

  function closeMobileMenu() {
    var panel = qs("mobile-panel");
    var toggle = qs("menu-toggle");
    var openI = qs("menu-icon-open");
    var closeI = qs("menu-icon-close");
    if (!panel || !toggle) return;
    panel.classList.add("hidden");
    toggle.setAttribute("aria-expanded", "false");
    if (openI) openI.classList.remove("hidden");
    if (closeI) closeI.classList.add("hidden");
  }

  function openMobileMenu() {
    var panel = qs("mobile-panel");
    var toggle = qs("menu-toggle");
    var openI = qs("menu-icon-open");
    var closeI = qs("menu-icon-close");
    if (!panel || !toggle) return;
    panel.classList.remove("hidden");
    toggle.setAttribute("aria-expanded", "true");
    if (openI) openI.classList.add("hidden");
    if (closeI) closeI.classList.remove("hidden");
  }

  var menuToggle = qs("menu-toggle");
  if (menuToggle) {
    menuToggle.addEventListener("click", function () {
      var expanded = menuToggle.getAttribute("aria-expanded") === "true";
      if (expanded) closeMobileMenu();
      else openMobileMenu();
    });
  }

  document.querySelectorAll('#mobile-panel a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", closeMobileMenu);
  });

  document.querySelectorAll("[data-scroll-top]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      closeMobileMenu();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  document.querySelectorAll("[data-track]").forEach(function (el) {
    el.addEventListener("click", function () {
      trackEvent(el.getAttribute("data-track"), {
        label: (el.textContent || "").trim().slice(0, 80),
      });
    });
  });

  var USO_PREFILL_MAP = {
    cotizacion: "",
    api: "integracion-api",
    "integracion-api": "integracion-api",
    "alto-volumen": "campanas-comerciales",
    marketing: "campanas-comerciales",
    notificaciones: "notificaciones-alertas",
    cobranza: "recordatorios-cobranza",
    otp: "otp-validacion",
  };

  function mapVolumePrefill(v) {
    if (v === undefined || v === null || v === "") return "";
    var n = parseInt(String(v).replace(/\D/g, ""), 10);
    if (!isNaN(n) && String(v).match(/\d/)) {
      if (n < 10000) return "menos-10000";
      if (n <= 50000) return "10000-50000";
      if (n <= 100000) return "50000-100000";
      return "mas-100000";
    }
    var legacy = {
      "100000+": "mas-100000",
      "200000+": "mas-100000",
      "15000-100000": "50000-100000",
      "3000-15000": "10000-50000",
    };
    return legacy[v] || v;
  }

  function scrollToContact(prefill) {
    closeMobileMenu();
    var el = qs("contacto");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (prefill) {
      if (prefill.interes) {
        var uso = qs("uso-principal");
        if (uso) uso.value = USO_PREFILL_MAP[prefill.interes] || prefill.interes;
      }
      if (prefill.volumen !== undefined) {
        var vol = qs("volumen-mensual");
        if (vol) vol.value = mapVolumePrefill(prefill.volumen);
      }
      if (typeof prefill.mensaje === "string") {
        var mensajeField = qs("lead-mensaje");
        if (mensajeField) {
          mensajeField.value = prefill.mensaje;
        } else {
          var nota = qs("lead-nota");
          if (nota) nota.value = prefill.mensaje;
        }
      }
    }
    var nombre = qs("lead-nombre");
    if (nombre) setTimeout(function () { nombre.focus(); }, 400);
  }

  function selectOptionLabel(id) {
    var el = qs(id);
    if (!el || !el.value) return "";
    var opt = el.options[el.selectedIndex];
    return opt ? opt.text.trim() : el.value;
  }

  function clearLeadFieldErrors() {
    ["lead-nombre", "lead-contacto", "volumen-mensual", "uso-principal"].forEach(function (id) {
      var field = qs(id);
      if (field) field.removeAttribute("aria-invalid");
    });
  }

  function markLeadFieldError(id) {
    var field = qs(id);
    if (field) field.setAttribute("aria-invalid", "true");
  }

  function recommendBagForNeed(needVol) {
    var need = +needVol;
    if (need > 100000) return { type: "quote" };
    if (need <= 1000) return { type: "bag", bag: bagById("1k") };
    if (need <= 15000) return { type: "bag", bag: bagById("15k") };
    return { type: "bag", bag: bagById("100k") };
  }

  function formatBagPrice(net) {
    return "$" + fmt(net) + " + IVA";
  }

  function bagById(id) {
    return BAGS.find(function (b) {
      return b.id === id;
    });
  }

  var compraState = { bagId: null, sms: 0, priceNet: 0, label: "", source: "" };

  function openCompraModal(payload) {
    var modal = qs("compra-modal");
    if (!modal) return;

    if (CFG.checkoutUrl && payload && payload.bagId) {
      trackEvent("click_comprar_bolsa", { bagId: payload.bagId, checkout: true });
      window.location.href = CFG.checkoutUrl + (CFG.checkoutUrl.indexOf("?") >= 0 ? "&" : "?") + "bag=" + encodeURIComponent(payload.bagId);
      return;
    }

    compraState = Object.assign(
      { bagId: null, sms: 0, priceNet: 0, label: "", source: payload && payload.source ? payload.source : "web" },
      payload || {}
    );

    var iva = Math.round(compraState.priceNet * IVA_RATE);
    var total = compraState.priceNet + iva;

    var title = qs("compra-modal-title");
    var summary = qs("compra-resumen");
    if (title) title.textContent = "Activar bolsa SMS";
    if (summary) {
      summary.innerHTML =
        "<strong>" +
        (compraState.label || "Bolsa SMS") +
        "</strong><br>" +
        fmt(compraState.sms) +
        " SMS · Neto $" +
        fmt(compraState.priceNet) +
        " · IVA $" +
        fmt(iva) +
        " · Total $" +
        fmt(total) +
        " CLP";
    }

    qs("compra-bag-id").value = compraState.bagId || "";
    qs("compra-bag-label").value = compraState.label || "";

    modal.hidden = false;
    document.body.classList.add("modal-open");
    var first = qs("compra-nombre");
    if (first) setTimeout(function () { first.focus(); }, 100);
  }

  function closeCompraModal() {
    var modal = qs("compra-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function initCompraModal() {
    var modal = qs("compra-modal");
    if (!modal) return;

    modal.querySelectorAll("[data-close-modal]").forEach(function (el) {
      el.addEventListener("click", closeCompraModal);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) closeCompraModal();
    });

    var form = qs("compra-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var honeypot = qs("compra-website");
        if (honeypot && honeypot.value) return;

        var nombre = (qs("compra-nombre").value || "").trim();
        var empresa = (qs("compra-empresa").value || "").trim();
        var rut = (qs("compra-rut").value || "").trim();
        var email = (qs("compra-email").value || "").trim();
        var whatsapp = (qs("compra-whatsapp").value || "").trim();
        var bagLabel = qs("compra-bag-label").value || compraState.label;

        if (nombre.length < 2 || empresa.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || whatsapp.length < 8) {
          alert("Complete nombre, empresa, email y WhatsApp válidos.");
          return;
        }

        var iva = Math.round(compraState.priceNet * IVA_RATE);
        var lines = [
          "Solicitud de activación de bolsa SMS (Telvoice.cl)",
          "Bolsa: " + bagLabel,
          "SMS: " + fmt(compraState.sms),
          "Neto: $" + fmt(compraState.priceNet),
          "IVA: $" + fmt(iva),
          "Total: $" + fmt(compraState.priceNet + iva),
          "",
          "Nombre: " + nombre,
          "Empresa: " + empresa,
          "RUT: " + (rut || "—"),
          "Email: " + email,
          "WhatsApp: " + whatsapp,
        ];
        var subject = encodeURIComponent("[Telvoice] Activar bolsa — " + empresa);
        var body = encodeURIComponent(lines.join("\n"));
        window.location.href = "mailto:" + SALES_EMAIL + "?subject=" + subject + "&body=" + body;
        closeCompraModal();
      });
    }
  }

  function openCompraFromCard(btn) {
    var card = btn.closest("[data-bag-id], [data-pack]");
    if (!card) return;
    var bagId = card.getAttribute("data-bag-id");
    var bag = bagId ? bagById(bagId) : null;
    if (bag) {
      openCompraModal({
        bagId: bag.id,
        sms: bag.sms,
        priceNet: bag.priceNet,
        label: bag.label,
        source: "pack-card",
      });
      return;
    }
    var sms = parseInt(card.getAttribute("data-sms") || "0", 10);
    var priceStr = (card.getAttribute("data-price") || "").replace(/[^\d]/g, "");
    openCompraModal({
      bagId: bagId || "custom",
      sms: sms,
      priceNet: parseInt(priceStr, 10) || 0,
      label: card.getAttribute("data-pack") || "Bolsa SMS",
      source: "pack-card",
    });
  }

  document.querySelectorAll(".pack-cta").forEach(function (btn) {
    btn.addEventListener("click", function () {
      openCompraFromCard(btn);
    });
  });

  function bindDemoButtons() {
    ["nav-demo", "nav-demo-mobile", ".final-cta"].forEach(function (sel) {
      var nodes = sel.indexOf(".") === 0 ? document.querySelectorAll(sel) : [qs(sel)];
      nodes.forEach(function (b) {
        if (!b) return;
        b.addEventListener("click", function () {
          scrollToContact({ interes: "cotizacion" });
        });
      });
    });
    document.querySelectorAll(".api-request-cta").forEach(function (b) {
      b.addEventListener("click", function () {
        scrollToContact({ interes: "integracion-api" });
      });
    });
    document.querySelectorAll(".empresas-cta, .comercial-cotizar-cta").forEach(function (b) {
      b.addEventListener("click", function () {
        scrollToContact({ interes: "alto-volumen", volumen: "mas-100000" });
      });
    });
    document.querySelectorAll(".comercial-comprar-cta").forEach(function (b) {
      b.addEventListener("click", function () {
        var el = qs("precios");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    document.querySelectorAll(".comercial-api-cta").forEach(function (b) {
      b.addEventListener("click", function () {
        scrollToContact({ interes: "integracion-api" });
      });
    });
  }
  bindDemoButtons();

  function initHeroPricing() {
    var hero = CFG.hero || {};
    var bagsLabel = qs("hero-bags-label");
    var priceDetail = qs("hero-price-detail");
    var priceEl = qs("hero-from-price");
    var noteEl = qs("hero-price-note");
    if (bagsLabel && hero.bagsFromLabel) bagsLabel.textContent = hero.bagsFromLabel;
    if (priceDetail && hero.fromPriceDetail) priceDetail.textContent = hero.fromPriceDetail;
    if (priceEl && hero.fromPriceSms != null) priceEl.textContent = "$" + hero.fromPriceSms;
    if (noteEl && hero.fromPriceNote) noteEl.textContent = hero.fromPriceNote;
  }
  initHeroPricing();

  function initCalculadora() {
    var slider = qs("calcSlider");
    if (!slider) return;

    var calcVol = qs("calcVol");
    var calcPxSMS = qs("calcPxSMS");
    var calcTotal = qs("calcTotal");
    var calcPlan = qs("calcPlan");
    var calcBagSms = qs("calcBagSms");
    var quoteBtn = qs("calc-request-quote");
    var buyBtn = qs("calc-buy-bolsa");
    var quoteMsg = qs("calc-quote-msg");
    var minV = +slider.min;
    var maxV = +slider.max;
    var lastTrackVol = null;
    var lastRec = null;

    function calcSetSliderProgress() {
      var val = +slider.value;
      var pct = ((val - minV) / (maxV - minV)) * 100;
      slider.style.background = "linear-gradient(to right, #0052cc " + pct + "%, #c3c6d6 " + pct + "%)";
    }

    function setCalcQuoteMode(needVol) {
      if (calcPlan) calcPlan.textContent = "Cotización personalizada";
      if (calcBagSms) calcBagSms.textContent = "—";
      if (calcTotal) calcTotal.textContent = "—";
      if (calcPxSMS) calcPxSMS.textContent = "—";
      if (quoteMsg) quoteMsg.classList.remove("hidden");
      if (buyBtn) buyBtn.classList.add("hidden");
      if (quoteBtn) quoteBtn.classList.remove("hidden");
      lastRec = { type: "quote", need: needVol };
    }

    function setCalcBagMode(bag) {
      var planName = bag.planName || bag.label;
      if (calcPlan) calcPlan.textContent = planName;
      if (calcBagSms) calcBagSms.textContent = fmt(bag.sms) + " SMS";
      if (calcTotal) calcTotal.textContent = formatBagPrice(bag.priceNet);
      if (calcPxSMS) calcPxSMS.textContent = "$" + bag.pxSms + " + IVA por SMS";
      if (quoteMsg) quoteMsg.classList.add("hidden");
      if (buyBtn) buyBtn.classList.remove("hidden");
      if (quoteBtn) quoteBtn.classList.add("hidden");
      lastRec = { type: "bag", bag: bag };
    }

    function updateCalc() {
      var vol = Math.round(+slider.value / 1000) * 1000;
      if (vol < minV) vol = minV;
      if (vol > maxV) vol = maxV;
      if (+slider.value !== vol) slider.value = String(vol);
      slider.setAttribute("aria-valuenow", String(vol));
      if (calcVol) calcVol.textContent = fmt(vol);
      calcSetSliderProgress();

      var rec = recommendBagForNeed(vol);
      if (rec.type === "quote") {
        setCalcQuoteMode(vol);
      } else {
        setCalcBagMode(rec.bag);
      }

      if (lastTrackVol !== vol) {
        trackEvent("select_sms_plan", {
          volume: vol,
          plan: rec.type === "bag" ? rec.bag.id : "quote",
          pxSms: rec.type === "bag" ? rec.bag.pxSms : null,
        });
        lastTrackVol = vol;
      }
    }

    slider.addEventListener("input", updateCalc);

    if (quoteBtn) {
      quoteBtn.addEventListener("click", function () {
        var vol = +slider.value;
        var line =
          "Cotización (calculadora): necesito aproximadamente " +
          fmt(vol) +
          " SMS. Solicito condiciones para alto volumen.";
        scrollToContact({ interes: "alto-volumen", volumen: String(vol), mensaje: line });
        trackEvent("click_cotizar_volumen", { volume: vol });
      });
    }

    if (buyBtn) {
      buyBtn.addEventListener("click", function () {
        if (!lastRec || lastRec.type !== "bag" || !lastRec.bag) return;
        openCompraModal({
          bagId: lastRec.bag.id,
          sms: lastRec.bag.sms,
          priceNet: lastRec.bag.priceNet,
          label: lastRec.bag.label,
          source: "calculadora",
        });
        trackEvent("click_comprar_bolsa", { bagId: lastRec.bag.id, source: "calculadora" });
      });
    }

    updateCalc();
  }
  initCalculadora();

  function showFormAlert(type, text) {
    var box = qs("form-alert");
    if (!box) return;
    box.classList.remove("hidden", "bg-error-container", "text-on-error-container", "bg-secondary-fixed", "text-on-secondary-fixed");
    if (type === "error") {
      box.classList.add("bg-error-container", "text-on-error-container");
    } else {
      box.classList.add("bg-secondary-fixed", "text-on-secondary-fixed");
    }
    box.textContent = text;
  }

  var form = qs("lead-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearLeadFieldErrors();

      var honeypot = qs("website");
      if (honeypot && honeypot.value) {
        showFormAlert("ok", "Solicitud enviada. Te contactaremos pronto para revisar la mejor opción para tu empresa.");
        return;
      }

      var nombreEmpresa = (qs("lead-nombre").value || "").trim();
      var contacto = (qs("lead-contacto").value || "").trim();
      var volumen = (qs("volumen-mensual") && qs("volumen-mensual").value) || "";
      var uso = qs("uso-principal") ? qs("uso-principal").value : "";
      var mensaje = qs("lead-mensaje") ? (qs("lead-mensaje").value || "").trim() : "";
      var nota = qs("lead-nota") ? (qs("lead-nota").value || "").trim() : "";

      if (nombreEmpresa.length < 2) {
        showFormAlert("error", "Indique su nombre o el nombre de su empresa.");
        markLeadFieldError("lead-nombre");
        qs("lead-nombre").focus();
        return;
      }
      if (!contacto) {
        showFormAlert("error", "Indique un WhatsApp o correo de contacto.");
        markLeadFieldError("lead-contacto");
        qs("lead-contacto").focus();
        return;
      }
      if (!volumen) {
        showFormAlert("error", "Seleccione el volumen mensual estimado.");
        markLeadFieldError("volumen-mensual");
        qs("volumen-mensual").focus();
        return;
      }
      if (!uso) {
        showFormAlert("error", "Seleccione el uso principal.");
        markLeadFieldError("uso-principal");
        qs("uso-principal").focus();
        return;
      }

      var volumenLabel = selectOptionLabel("volumen-mensual");
      var usoLabel = selectOptionLabel("uso-principal");
      var fecha = new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" });

      var lines = [
        "Solicitud de cotización SMS — Telvoice.cl",
        "",
        "Origen: formulario web telvoice.cl",
        "Fecha de solicitud: " + fecha,
        "",
        "Nombre o empresa: " + nombreEmpresa,
        "WhatsApp o correo: " + contacto,
        "Volumen mensual estimado: " + volumenLabel,
        "Uso principal: " + usoLabel,
      ];
      if (mensaje) {
        lines.push("", "Mensaje:", mensaje);
      }
      if (nota && nota !== mensaje) {
        lines.push("", "Contexto:", nota);
      }

      var subject = encodeURIComponent("[Telvoice] Cotización SMS — " + nombreEmpresa);
      var body = encodeURIComponent(lines.join("\n"));
      trackEvent("submit_lead_empresa", { volumen: volumen, uso: uso });

      showFormAlert("ok", "Solicitud enviada. Te contactaremos pronto para revisar la mejor opción para tu empresa.");
      window.setTimeout(function () {
        window.location.href = "mailto:" + SALES_EMAIL + "?subject=" + subject + "&body=" + body;
      }, 400);
    });
  }

  function initFaq() {
    var more = qs("faq-more");
    var btn = qs("faq-show-more");
    if (!more || !btn) return;

    var label = qs("faq-show-more-text");
    var icon = btn.querySelector(".material-symbols-outlined");

    btn.addEventListener("click", function () {
      var willExpand = more.hasAttribute("hidden");
      if (willExpand) {
        more.removeAttribute("hidden");
        btn.setAttribute("aria-expanded", "true");
        if (label) label.textContent = "Ver menos preguntas frecuentes";
        if (icon) icon.textContent = "expand_less";
      } else {
        more.setAttribute("hidden", "");
        btn.setAttribute("aria-expanded", "false");
        if (label) label.textContent = "Ver más preguntas frecuentes";
        if (icon) icon.textContent = "expand_more";
      }
    });
  }

  initFaq();
  initCompraModal();
  bindWhatsappLinks();
})();
