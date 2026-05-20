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
    try {
      if (typeof window.gtag === "function") {
        window.gtag("event", name, detail || {});
      }
      if (typeof window.dataLayer !== "undefined" && typeof window.dataLayer.push === "function") {
        window.dataLayer.push(Object.assign({ event: name }, detail || {}));
      }
    } catch (trackErr) {
      console.warn("[track]", trackErr);
    }
  }

  function apiUrl(path) {
    var cfg = window.TELVOICE_CONFIG || {};
    var base = (cfg.apiOrigin || "").replace(/\/$/, "");
    if (!base && window.location.hostname === "telvoice.cl") {
      base = "https://www.telvoice.cl";
    }
    return base ? base + path : path;
  }

  window.TelvoiceTrack = trackEvent;

  function whatsappUrl(customMessage) {
    var wa = CFG.whatsapp || {};
    var num = (wa.number || "").replace(/\D/g, "");
    if (!num) return null;
    var text = encodeURIComponent(customMessage || wa.message || "Hola, quiero cotizar una bolsa de SMS para Chile.");
    return "https://wa.me/" + num + "?text=" + text;
  }

  function openWhatsapp(message) {
    var url = whatsappUrl(message);
    if (!url) return false;
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
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
  }

  function bindVentasWhatsappButtons() {
    var waMsg = (CFG.whatsapp && CFG.whatsapp.message) || "Hola, quiero cotizar una bolsa de SMS para Chile.";
    ["nav-demo", "nav-demo-hero", "nav-demo-mobile", "comercial-cotizar-cta"].forEach(function (sel) {
      var nodes = sel.indexOf(".") === 0 ? document.querySelectorAll(sel) : [qs(sel)];
      nodes.forEach(function (btn) {
        if (!btn) return;
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          if (openWhatsapp(waMsg)) {
            trackEvent("click_hablar_ventas", { channel: "whatsapp" });
          }
        });
      });
    });
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
    var list = [200];
    var v;
    for (v = 1000; v <= 90000; v += 1000) list.push(v);
    for (v = 100000; v <= CALC_MAX_VOL; v += 1000) list.push(v);
    return list;
  }

  var CALC_VOLUMES = buildCalcVolumes();

  function snapCalcVolume(vol) {
    var v = Math.round(+vol);
    if (v <= 200) return 200;
    v = Math.round(v / 1000) * 1000;
    if (v < 1000) return 1000;
    if (v > CALC_MAX_VOL) return CALC_MAX_VOL;
    if (v > 90000 && v < 100000) return 100000;
    return v;
  }

  function volumeToSliderIndex(vol) {
    var v = snapCalcVolume(vol);
    var idx = CALC_VOLUMES.indexOf(v);
    if (idx >= 0) return idx;
    if (v === 200) return 0;
    if (v <= 90000) return v / 1000;
    return 91 + (v / 1000 - 100);
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

  function planFromCalcVolume(vol) {
    var v = snapCalcVolume(vol);
    var tier = findCalcTier(v);
    if (!tier) return null;
    var net = v * tier.pxSMS;
    var tax = Math.round(net * IVA_RATE);
    return {
      plan_id: "calc",
      name: "Bolsa " + fmt(v) + " SMS",
      sms: v,
      net_amount: net,
      tax_amount: tax,
      total_amount: net + tax,
    };
  }

  function formatCalcMoney(amount) {
    return "$" + fmt(amount) + " + IVA";
  }

  function formatCalcTotalWithIva(net) {
    return "$" + fmt(Math.round(net * (1 + IVA_RATE)));
  }

  function calcTierSuggestionVolumes() {
    var out = [];
    CALC_TIERS.forEach(function (tier, i) {
      if (i === 0 || tier.pxSMS !== CALC_TIERS[i - 1].pxSMS) {
        out.push({ vol: tier.min, pxSMS: tier.pxSMS });
      }
    });
    return out;
  }

  function formatCalcChipVolume(vol) {
    return vol < 1000 ? String(vol) : fmt(vol);
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
  var ONLINE_PLAN_IDS = { prueba: true, inicial: true, empresa: true, volumen: true, calc: true };

  var compraState = {
    planId: null,
    calcSms: null,
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

  var compraSubmitting = false;
  var COMPRA_PAY_ERROR =
    "No pudimos iniciar el pago. Intenta nuevamente o contáctanos por WhatsApp.";

  function setCompraLoading(loading) {
    var btn = qs("compra-submit");
    if (btn) {
      btn.disabled = !!loading;
      btn.setAttribute("aria-busy", loading ? "true" : "false");
      btn.textContent = loading ? "Redirigiendo a Mercado Pago…" : "Pagar con Mercado Pago";
    }
  }

  function resolveCheckoutUrl(data) {
    if (!data) return null;
    return (
      data.checkout_url ||
      data.init_point ||
      data.sandbox_init_point ||
      data.url ||
      null
    );
  }

  function parseApiJson(res) {
    var ct = res.headers.get("content-type") || "";
    if (ct.indexOf("application/json") >= 0) {
      return res.json();
    }
    return res.text().then(function (text) {
      if (res.status === 404) {
        throw new Error(
          "No se encontró el servicio de pago. Confirme que el sitio está desplegado en Vercel con las funciones API."
        );
      }
      throw new Error("Respuesta inválida del servidor (HTTP " + res.status + ").");
    });
  }

  function openCompraModal(payload) {
    var modal = qs("compra-modal");
    if (!modal || !payload) return;

    var resolvedPlanId = payload.planId || payload.plan_id || (payload.calcSms ? "calc" : null);
    if (!resolvedPlanId) return;

    compraSubmitting = false;

    compraState = {
      planId: resolvedPlanId,
      calcSms: payload.calcSms || null,
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

    var sandboxHint = qs("compra-sandbox-hint");
    if (sandboxHint) {
      if (CFG.mercadoPagoSandbox) sandboxHint.classList.remove("hidden");
      else sandboxHint.classList.add("hidden");
    }

    var submitBtn = qs("compra-submit");
    if (submitBtn && !submitBtn.dataset.mpBound) {
      submitBtn.dataset.mpBound = "1";
      submitBtn.addEventListener("click", function (e) {
        e.preventDefault();
        startMercadoPagoCheckout();
      });
    }

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

  function startMercadoPagoCheckout() {
    if (compraSubmitting) return;

    var honeypot = qs("compra-website");
    if (honeypot && honeypot.value) return;

    var nombreEl = qs("compra-nombre");
    var razonEl = qs("compra-razon-social");
    var rutEl = qs("compra-rut");
    var emailEl = qs("compra-email");
    var whatsappEl = qs("compra-whatsapp");
    var planInput = qs("compra-plan-id");

    var nombre = (nombreEl && nombreEl.value ? nombreEl.value : "").trim();
    var razonSocial = (razonEl && razonEl.value ? razonEl.value : "").trim();
    var rut = (rutEl && rutEl.value ? rutEl.value : "").trim();
    var email = (emailEl && emailEl.value ? emailEl.value : "").trim();
    var whatsapp = (whatsappEl && whatsappEl.value ? whatsappEl.value : "").trim();
    var planId = (
      (planInput && planInput.value ? planInput.value : "") ||
      compraState.planId ||
      ""
    ).trim();

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
    if (compraState.calcSms) {
      if (!planId || planId !== "calc") {
        setCompraError("Plan no disponible para pago online.");
        return;
      }
    } else if (!planId || !ONLINE_PLAN_IDS[planId]) {
      setCompraError("Plan no disponible para pago online.");
      return;
    }

    console.log("Iniciando pago Mercado Pago", {
      planId: planId,
      calcSms: compraState.calcSms || null,
    });

    setCompraError("");
    compraSubmitting = true;
    setCompraLoading(true);

    var checkoutEndpoint = apiUrl("/api/mercadopago/create-preference");
    var abortController = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeoutId = window.setTimeout(function () {
      if (abortController) abortController.abort();
    }, 45000);

    var fetchOpts = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: abortController ? abortController.signal : undefined,
      body: JSON.stringify(
        Object.assign(
          {
            customer: {
              name: nombre,
              email: email,
              phone: whatsapp,
              rut: rut,
              business_name: razonSocial || null,
            },
          },
          compraState.calcSms ? { calc_sms: compraState.calcSms } : { plan_id: planId }
        )
      ),
    };
    if (checkoutEndpoint.indexOf("http") !== 0) {
      fetchOpts.credentials = "same-origin";
    }

    fetch(checkoutEndpoint, fetchOpts)
      .then(function (res) {
        return parseApiJson(res).then(function (data) {
          return { httpOk: res.ok, status: res.status, data: data };
        });
      })
      .then(function (result) {
        var data = result.data || {};
        var checkoutUrl = resolveCheckoutUrl(data);

        if (!result.httpOk || data.ok === false) {
          throw new Error(data.error || COMPRA_PAY_ERROR);
        }
        if (!checkoutUrl) {
          throw new Error("No se recibió URL de Mercado Pago");
        }

        trackEvent("click_comprar_online", { planId: planId, source: compraState.source });
        window.location.href = checkoutUrl;
      })
      .catch(function (err) {
        compraSubmitting = false;
        setCompraLoading(false);
        console.error("[checkout] create-preference failed", err.message || err);
        var msg = err.message || COMPRA_PAY_ERROR;
        if (err.name === "AbortError") {
          msg = COMPRA_PAY_ERROR;
        }
        if (/^Vercel Blob:|^MERCADOPAGO_|token no configurado|failed to fetch|network/i.test(msg)) {
          msg = COMPRA_PAY_ERROR;
        }
        setCompraError(msg);
      })
      .finally(function () {
        window.clearTimeout(timeoutId);
      });
  }

  function bindCompraCheckoutHandlers() {
    document.addEventListener(
      "submit",
      function (e) {
        var form = e.target;
        if (!form || form.id !== "compra-form") return;
        e.preventDefault();
        e.stopPropagation();
        startMercadoPagoCheckout();
      },
      true
    );

    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest("#compra-submit");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      startMercadoPagoCheckout();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var form = qs("compra-form");
      var modal = qs("compra-modal");
      if (!form || !modal || modal.hidden) return;
      if (!form.contains(e.target)) return;
      e.preventDefault();
      startMercadoPagoCheckout();
    });
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
    document.querySelectorAll(".api-request-cta").forEach(function (b) {
      b.addEventListener("click", function () {
        scrollToContact({ interes: "integracion-api" });
      });
    });
    document.querySelectorAll(".empresas-cta").forEach(function (b) {
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
  bindVentasWhatsappButtons();

  var calcQuoteLink = qs("calc-quote-link");
  if (calcQuoteLink) {
    calcQuoteLink.addEventListener("click", function (e) {
      e.preventDefault();
      scrollToContact({
        interes: "alto-volumen",
        volumen: "mas-100000",
        mensaje: "Cotización para más de 120.000 SMS (desde calculadora).",
      });
      trackEvent("click_cotiza_alto_volumen");
    });
  }

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

  var setCalcVolume = null;

  function initCalculadora() {
    var slider = qs("calcSlider");
    if (!slider) return;

    var calcVol = qs("calcVol");
    var calcQty = qs("calcQty");
    var calcTier = qs("calcTier");
    var calcPxSMS = qs("calcPxSMS");
    var calcTotal = qs("calcTotal");
    var buyBtn = qs("calc-buy-btn");
    var suggestionsEl = qs("calcSliderSuggestions");
    var sliderMax = CALC_VOLUMES.length - 1;
    var tierSuggestions = calcTierSuggestionVolumes();
    var lastTrackVol = null;
    var currentVol = 200;

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

      var net = vol * tier.pxSMS;
      if (calcQty) calcQty.textContent = fmt(vol) + " SMS";
      if (calcTier) calcTier.textContent = tier.label;
      if (calcPxSMS) calcPxSMS.textContent = "$" + tier.pxSMS + " + IVA por SMS";
      if (calcTotal) calcTotal.textContent = formatCalcTotalWithIva(net);

      if (suggestionsEl) {
        suggestionsEl.querySelectorAll(".calc-tier-chip").forEach(function (btn) {
          var match = +btn.getAttribute("data-volume") === vol;
          btn.classList.toggle("is-active", match);
          btn.setAttribute("aria-pressed", match ? "true" : "false");
        });
      }

      var calcPlan = planFromCalcVolume(vol);
      if (buyBtn && calcPlan) {
        buyBtn.hidden = false;
        buyBtn.textContent = "Comprar " + fmt(calcPlan.sms) + " SMS online";
      }

      if (lastTrackVol !== vol) {
        trackEvent("select_sms_plan", { volume: vol, pxSms: tier.pxSMS, tier: tier.label });
        lastTrackVol = vol;
      }
    }

    slider.addEventListener("input", updateCalc);

    if (buyBtn) {
      buyBtn.addEventListener("click", function () {
        var plan = planFromCalcVolume(currentVol);
        if (!plan) return;
        openCompraModal({
          planId: plan.plan_id,
          calcSms: plan.plan_id === "calc" ? plan.sms : null,
          planName: plan.name,
          sms: plan.sms,
          net_amount: plan.net_amount,
          tax_amount: plan.tax_amount,
          total_amount: plan.total_amount,
          source: "calculadora",
        });
        trackEvent("click_comprar_online", {
          planId: plan.plan_id,
          source: "calculadora",
          volume: currentVol,
        });
      });
    }

    setCalcVolume = function (vol) {
      var idx = volumeToSliderIndex(vol);
      slider.value = String(idx);
      updateCalc();
    };

    if (suggestionsEl) {
      tierSuggestions.forEach(function (item) {
        var vol = item.vol;
        var idx = volumeToSliderIndex(vol);
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "calc-tier-chip";
        btn.setAttribute("data-volume", String(vol));
        btn.setAttribute("aria-pressed", "false");
        btn.setAttribute(
          "aria-label",
          fmt(vol) + " SMS · $" + item.pxSMS + " + IVA por SMS"
        );
        btn.appendChild(document.createTextNode(formatCalcChipVolume(vol) + " SMS"));
        var sub = document.createElement("span");
        sub.className = "calc-tier-chip-sub";
        sub.textContent = "$" + item.pxSMS;
        btn.appendChild(sub);
        btn.addEventListener("click", function () {
          if (setCalcVolume) setCalcVolume(vol);
          else {
            slider.value = String(idx);
            updateCalc();
          }
        });
        suggestionsEl.appendChild(btn);
      });
    }

    slider.value = String(volumeToSliderIndex(200));
    updateCalc();
  }
  initCalculadora();

  var heroPriceCta = qs("hero-price-cta");
  if (heroPriceCta) {
    heroPriceCta.addEventListener("click", function (e) {
      var targetVol = parseInt(heroPriceCta.getAttribute("data-calc-volume") || "100000", 10);
      var calcSection = qs("calculadora");
      if (!calcSection) return;
      e.preventDefault();
      calcSection.scrollIntoView({ behavior: "smooth", block: "start" });
      if (setCalcVolume) {
        setTimeout(function () {
          setCalcVolume(targetVol);
        }, 350);
      }
      trackEvent("click_hero_precio_volumen", { volume: targetVol });
    });
  }

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
  bindCompraCheckoutHandlers();
  initCompraModal();
  bindWhatsappLinks();
})();
