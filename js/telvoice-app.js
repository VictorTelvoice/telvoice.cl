(function () {
  var CFG = window.TELVOICE_CONFIG || {};
  var SALES_EMAIL = CFG.salesEmail || "ventas@telvoice.net";
  var IVA_RATE = CFG.ivaRate != null ? CFG.ivaRate : 0.19;
  var QUOTE_MIN = CFG.quoteVolumeMin != null ? CFG.quoteVolumeMin : 200000;
  var BAGS = CFG.bags || [];
  var CALC_TIERS = CFG.volumeTiers || [];
  var CALC_MAX_VOL = CFG.calcMaxVolume != null ? CFG.calcMaxVolume : 120000;

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

  function buildCalcVolumes() {
    var list = [];
    var v;
    for (v = 1000; v <= 90000; v += 1000) list.push(v);
    for (v = 100000; v <= CALC_MAX_VOL; v += 1000) list.push(v);
    return list;
  }

  var CALC_VOLUMES = buildCalcVolumes();

  function snapCalcVolume(vol) {
    var v = Math.round(+vol / 1000) * 1000;
    if (v < 1000) return 1000;
    if (v > CALC_MAX_VOL) return CALC_MAX_VOL;
    if (v > 90000 && v < 100000) return 100000;
    return v;
  }

  function volumeToSliderIndex(vol) {
    var v = snapCalcVolume(vol);
    if (v <= 90000) return v / 1000 - 1;
    return 90 + (v / 1000 - 100);
  }

  function sliderIndexToVolume(idx) {
    var i = Math.max(0, Math.min(CALC_VOLUMES.length - 1, Math.round(+idx)));
    return CALC_VOLUMES[i];
  }

  function findCalcTier(vol) {
    var v = snapCalcVolume(vol);
    return (
      CALC_TIERS.find(function (t) {
        return v >= t.min && v <= t.max;
      }) || null
    );
  }

  function formatCalcMoney(amount) {
    return "$" + fmt(amount) + " + IVA";
  }

  function formatBagPrice(net) {
    return "$" + fmt(net) + " + IVA";
  }

  function bagById(id) {
    return BAGS.find(function (b) {
      return b.id === id;
    });
  }

  var BAG_TO_PLAN = { "1k": "inicial", "15k": "empresa", "100k": "volumen" };
  var ONLINE_PLAN_IDS = { inicial: true, empresa: true, volumen: true };

  var compraState = {
    planId: null,
    planName: "",
    sms: 0,
    net: 0,
    tax: 0,
    total: 0,
    source: "",
  };

  function planFromBag(bag) {
    if (!bag) return null;
    var planId = bag.id && BAG_TO_PLAN[bag.id];
    if (!planId || !ONLINE_PLAN_IDS[planId]) return null;
    var tax = Math.round(bag.priceNet * IVA_RATE);
    return {
      plan_id: planId,
      name: bag.planName || bag.label,
      sms: bag.sms,
      net_amount: bag.priceNet,
      tax_amount: tax,
      total_amount: bag.priceNet + tax,
    };
  }

  function renderCheckoutSummary(plan) {
    var el = qs("checkout-summary");
    if (!el || !plan) return;
    el.innerHTML =
      '<p class="checkout-summary__plan">' +
      plan.name +
      "</p>" +
      '<p class="checkout-summary__sms">' +
      fmt(plan.sms) +
      " SMS</p>" +
      '<div class="checkout-summary__rows">' +
      '<div class="checkout-summary__row"><span>Neto</span><span>$' +
      fmt(plan.net_amount) +
      "</span></div>" +
      '<div class="checkout-summary__row"><span>IVA 19%</span><span>$' +
      fmt(plan.tax_amount) +
      "</span></div>" +
      '<div class="checkout-summary__row checkout-summary__total"><span>Total a pagar</span><span>$' +
      fmt(plan.total_amount) +
      " CLP</span></div>" +
      "</div>";
  }

  function setCompraError(message) {
    var err = qs("compra-error");
    if (!err) return;
    if (message) {
      err.textContent = message;
      err.hidden = false;
    } else {
      err.textContent = "";
      err.hidden = true;
    }
  }

  function setCompraLoading(loading) {
    var btn = qs("compra-submit");
    if (btn) {
      btn.disabled = !!loading;
      btn.textContent = loading ? "Redirigiendo a Mercado Pago…" : "Pagar con Mercado Pago";
    }
  }

  function openCompraModal(payload) {
    var modal = qs("compra-modal");
    if (!modal || !payload || !payload.planId) return;

    compraState = {
      planId: payload.planId,
      planName: payload.planName || "",
      sms: payload.sms || 0,
      net: payload.net_amount || 0,
      tax: payload.tax_amount || 0,
      total: payload.total_amount || 0,
      source: payload.source || "web",
    };

    renderCheckoutSummary({
      name: compraState.planName,
      sms: compraState.sms,
      net_amount: compraState.net,
      tax_amount: compraState.tax,
      total_amount: compraState.total,
    });

    var planInput = qs("compra-plan-id");
    if (planInput) planInput.value = compraState.planId;

    setCompraError("");
    setCompraLoading(false);

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
        var razonSocial = (qs("compra-razon-social").value || "").trim();
        var rut = (qs("compra-rut").value || "").trim();
        var email = (qs("compra-email").value || "").trim();
        var whatsapp = (qs("compra-whatsapp").value || "").trim();
        var planId = (qs("compra-plan-id").value || compraState.planId || "").trim();

        if (nombre.length < 2) {
          setCompraError("Ingrese su nombre o empresa.");
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setCompraError("Ingrese un email válido.");
          return;
        }
        if (whatsapp.length < 8) {
          setCompraError("Ingrese un WhatsApp de contacto.");
          return;
        }
        if (rut.length < 8) {
          setCompraError("Ingrese un RUT válido.");
          return;
        }
        if (!planId || !ONLINE_PLAN_IDS[planId]) {
          setCompraError("Plan no disponible para pago online.");
          return;
        }

        setCompraError("");
        setCompraLoading(true);
        trackEvent("click_comprar_online", { planId: planId, source: compraState.source });

        fetch("/api/mercadopago/create-preference", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan_id: planId,
            customer: {
              name: nombre,
              email: email,
              phone: whatsapp,
              rut: rut,
              business_name: razonSocial || null,
            },
          }),
        })
          .then(function (res) {
            return res.json().then(function (data) {
              return { ok: res.ok, data: data };
            });
          })
          .then(function (result) {
            if (!result.ok || !result.data.init_point) {
              throw new Error(
                (result.data && result.data.error) ||
                  "No pudimos iniciar el pago. Intente nuevamente."
              );
            }
            window.location.href = result.data.init_point;
          })
          .catch(function (err) {
            setCompraLoading(false);
            setCompraError(err.message || "Error al conectar con el servidor de pagos.");
          });
      });
    }
  }

  function openCompraFromCard(btn) {
    var card = btn.closest("[data-plan-id], [data-bag-id], [data-pack]");
    if (!card) return;

    var planId = card.getAttribute("data-plan-id");
    if (!planId) {
      var bagId = card.getAttribute("data-bag-id");
      if (bagId && BAG_TO_PLAN[bagId]) planId = BAG_TO_PLAN[bagId];
    }

    var bag = card.getAttribute("data-bag-id") ? bagById(card.getAttribute("data-bag-id")) : null;
    var plan = bag ? planFromBag(bag) : null;

    if (!plan && planId && ONLINE_PLAN_IDS[planId]) {
      var matchBag = BAGS.find(function (b) {
        return BAG_TO_PLAN[b.id] === planId;
      });
      plan = matchBag ? planFromBag(matchBag) : null;
    }

    if (!plan) {
      alert("Este plan no está disponible para pago online. Use Cotizar alto volumen o contáctenos.");
      return;
    }

    openCompraModal({
      planId: plan.plan_id,
      planName: plan.name,
      sms: plan.sms,
      net_amount: plan.net_amount,
      tax_amount: plan.tax_amount,
      total_amount: plan.total_amount,
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
    var calcQty = qs("calcQty");
    var calcTier = qs("calcTier");
    var calcPxSMS = qs("calcPxSMS");
    var calcTotal = qs("calcTotal");
    var requestBtn = qs("calc-request-btn");
    var sliderMax = CALC_VOLUMES.length - 1;
    var lastTrackVol = null;
    var currentVol = 10000;

    slider.min = "0";
    slider.max = String(sliderMax);
    slider.step = "1";

    function calcSetSliderProgress() {
      var idx = +slider.value;
      var pct = sliderMax > 0 ? (idx / sliderMax) * 100 : 0;
      slider.style.background = "linear-gradient(to right, #0052cc " + pct + "%, #c3c6d6 " + pct + "%)";
    }

    function updateCalc() {
      var vol = sliderIndexToVolume(slider.value);
      var idx = volumeToSliderIndex(vol);
      if (+slider.value !== idx) slider.value = String(idx);

      currentVol = vol;
      slider.setAttribute("aria-valuenow", String(vol));
      if (calcVol) calcVol.textContent = fmt(vol) + " SMS";
      calcSetSliderProgress();

      var tier = findCalcTier(vol);
      if (!tier) return;

      var total = vol * tier.pxSMS;
      if (calcQty) calcQty.textContent = fmt(vol) + " SMS";
      if (calcTier) calcTier.textContent = tier.label;
      if (calcPxSMS) calcPxSMS.textContent = "$" + tier.pxSMS + " + IVA por SMS";
      if (calcTotal) calcTotal.textContent = formatCalcMoney(total);

      if (lastTrackVol !== vol) {
        trackEvent("select_sms_plan", { volume: vol, pxSms: tier.pxSMS, tier: tier.label });
        lastTrackVol = vol;
      }
    }

    slider.addEventListener("input", updateCalc);

    if (requestBtn) {
      requestBtn.addEventListener("click", function () {
        var tier = findCalcTier(currentVol);
        var line =
          "Solicitud desde calculadora: " +
          fmt(currentVol) +
          " SMS" +
          (tier ? " · Tramo " + tier.label + " · $" + tier.pxSMS + " + IVA/SMS · Total $" + fmt(currentVol * tier.pxSMS) + " + IVA" : "");
        scrollToContact({ interes: "cotizacion", volumen: String(currentVol), mensaje: line });
        trackEvent("click_cotizar_volumen", { volume: currentVol, source: "calculadora" });
      });
    }

    slider.value = String(volumeToSliderIndex(10000));
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
