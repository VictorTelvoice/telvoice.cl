(function () {
  var CFG = window.TELVOICE_CONFIG || {};
  var IVA_RATE = CFG.ivaRate != null ? CFG.ivaRate : 0.19;
  var QUOTE_MIN = CFG.quoteVolumeMin != null ? CFG.quoteVolumeMin : 200000;
  var BAGS = (CFG.bags || []).slice();
  if (CFG.showRetail200PurchaseChip === true && CFG.retail200Bag) {
    BAGS.unshift(CFG.retail200Bag);
  }
  var CALC_TIERS = CFG.volumeTiers || [];
  var CALC_MAX_VOL = CFG.calcMaxVolume != null ? CFG.calcMaxVolume : 120000;
  var PRICING_API = (CFG.pricingApiOrigin || "https://agent.telvoice.cl").replace(/\/$/, "");
  var retail200QaFromApi = false;
  var retail200ChipEl = null;

  function isQaBolsa200UrlMode() {
    try {
      return new URLSearchParams(window.location.search).get("qa_bolsa_200") === "1";
    } catch (e) {
      return false;
    }
  }

  function shouldShowRetail200QaChip(email) {
    var cfg = window.TELVOICE_CONFIG || {};
    if (cfg.showRetail200PurchaseChip === true) return true;
    if (isQaBolsa200UrlMode()) return true;
    if (email && String(email).trim().toLowerCase() === "licantravel@gmail.com") return true;
    if (retail200QaFromApi) return true;
    return false;
  }

  function syncRetail200ChipVisibility(email) {
    if (!retail200ChipEl) return;
    var show = shouldShowRetail200QaChip(email);
    retail200ChipEl.hidden = !show;
    retail200ChipEl.style.display = show ? "" : "none";
  }

  function probeRetail200QaFromApi() {
    fetch("https://agent.telvoice.cl/api/public/products", {
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        var products = (data && data.products) || [];
        retail200QaFromApi = products.some(function (p) {
          return (
            p &&
            p.qa_visible === true &&
            +p.sms_quantity === 200 &&
            +p.price_amount === 1000
          );
        });
        syncRetail200ChipVisibility(
          qs("compra-email") ? (qs("compra-email").value || "").trim() : ""
        );
      })
      .catch(function () {});
  }

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

  function openAgentForHighVolume(trackId) {
    var msg = "Quiero cotizar alto volumen para mi empresa";
    if (typeof window.TELVOICE_OPEN_AGENT === "function") {
      window.TELVOICE_OPEN_AGENT({ message: msg });
    } else {
      var launcher = document.querySelector(".tva-launcher");
      if (launcher) launcher.click();
    }
    if (trackId) trackEvent(trackId);
  }

  function openSalesAgent(trackId) {
    if (typeof window.TELVOICE_OPEN_AGENT === "function") {
      window.TELVOICE_OPEN_AGENT({ message: "" });
    } else {
      var launcher = document.querySelector(".tva-launcher");
      if (launcher) launcher.click();
    }
    if (trackId) trackEvent(trackId);
  }

  function getSiteNavHeight() {
    var nav = document.querySelector("body > nav");
    if (nav) return Math.ceil(nav.getBoundingClientRect().height);
    return 76;
  }

  function scrollToSectionEl(el, opts) {
    opts = opts || {};
    if (!el) return false;
    var offset = getSiteNavHeight();
    var top = el.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    if (opts.focus !== false && el.tabIndex >= 0) {
      try {
        el.focus({ preventScroll: true });
      } catch (_e) {
        el.focus();
      }
    }
    return true;
  }

  function scrollToSectionId(id, opts) {
    return scrollToSectionEl(document.getElementById(id), opts);
  }

  function bindInstantSectionNav() {
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      var raw = a.getAttribute("href");
      if (!raw || raw === "#" || a.hasAttribute("data-scroll-top")) return;
      var id = raw.slice(1);
      if (!id) return;
      a.addEventListener("click", function (e) {
        var target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        closeMobileMenu();
        if (history.replaceState) {
          history.replaceState(null, "", "#" + id);
        } else {
          window.location.hash = id;
        }
        scrollToSectionId(id);
      });
    });

    var initialHash = (window.location.hash || "").replace(/^#/, "");
    if (initialHash && document.getElementById(initialHash)) {
      requestAnimationFrame(function () {
        scrollToSectionId(initialHash, { focus: false });
      });
    }
  }

  bindInstantSectionNav();

  window.TELVOICE_SCROLL_TO_SECTION = scrollToSectionId;
  window.TELVOICE_SCROLL_TO_ELEMENT = scrollToSectionEl;

  function bindNavComprarSmsButtons() {
    ["nav-comprar-sms", "nav-comprar-sms-mobile"].forEach(function (sel) {
      var link = qs(sel);
      if (!link) {
        return;
      }
      link.addEventListener("click", function (e) {
        e.preventDefault();
        closeMobileMenu();
        var el = qs("calculadora");
        if (el) {
          scrollToSectionEl(el);
        } else {
          window.location.hash = "calculadora";
        }
        trackEvent("click_comprar_sms_nav");
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
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  });

  document.querySelectorAll("[data-track]").forEach(function (el) {
    el.addEventListener("click", function () {
      trackEvent(el.getAttribute("data-track"), {
        label: (el.textContent || "").trim().slice(0, 80),
      });
    });
  });

  function scrollToContact(prefill) {
    closeMobileMenu();
    var el = qs("contacto");
    if (el) scrollToSectionEl(el);
    if (prefill) {
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

  function clearLeadFieldErrors() {
    ["lead-nombre", "lead-correo", "lead-telefono", "lead-mensaje"].forEach(function (id) {
      var field = qs(id);
      if (field) field.removeAttribute("aria-invalid");
    });
  }

  function isValidLeadEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
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
    var v = Math.round(+vol);
    if (v < 1000) return 1000;
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
    if (v <= 90000) return Math.max(0, v / 1000 - 1);
    return 90 + (v / 1000 - 100);
  }

  function sliderIndexToVolume(idx) {
    var i = Math.max(0, Math.min(CALC_VOLUMES.length - 1, Math.round(+idx)));
    return CALC_VOLUMES[i];
  }

  function findCalcTier(vol) {
    var v = snapCalcVolume(vol);
    if (!CALC_TIERS.length) return null;
    var sorted = CALC_TIERS.slice().sort(function (a, b) {
      return (b.min_sms != null ? b.min_sms : b.min) - (a.min_sms != null ? a.min_sms : a.min);
    });
    for (var i = 0; i < sorted.length; i++) {
      var min = sorted[i].min_sms != null ? sorted[i].min_sms : sorted[i].min;
      if (v >= min) return sorted[i];
    }
    return sorted[sorted.length - 1] || null;
  }

  function tiersFromApiResponse(tiers) {
    var sorted = tiers.slice().sort(function (a, b) {
      return (a.min_sms || a.min_quantity) - (b.min_sms || b.min_quantity);
    });
    return sorted.map(function (t, i) {
      var minSms = t.min_sms != null ? t.min_sms : t.min_quantity;
      var nextMin = sorted[i + 1] ? (sorted[i + 1].min_sms || sorted[i + 1].min_quantity) : null;
      var max = nextMin ? nextMin - 1 : CALC_MAX_VOL;
      var px = t.unit_price_clp != null ? t.unit_price_clp : t.unit_price;
      return { min: minSms, max: max, min_sms: minSms, pxSMS: px, label: t.label };
    });
  }

  function applyBagsFromTiers(tiers) {
    var featured = [
      { id: "1k", sms: 1000, featured: false },
      { id: "15k", sms: 15000, featured: true },
      { id: "100k", sms: 100000, featured: false },
    ];
    var names = {
      "1k": "Plan Starter",
      "15k": "Plan Business",
      "100k": "Plan Corporativo",
    };
    BAGS.length = 0;
    if (CFG.showRetail200PurchaseChip === true && CFG.retail200Bag) {
      BAGS.push(CFG.retail200Bag);
    }
    featured.forEach(function (f) {
      var tier = findCalcTier(f.sms);
      if (!tier) return;
      var net = f.sms * tier.pxSMS;
      BAGS.push({
        id: f.id,
        planName: names[f.id],
        label: names[f.id] + " — " + fmt(f.sms) + " SMS",
        sms: f.sms,
        priceNet: net,
        pxSms: tier.pxSMS,
        maxNeed: f.sms,
        featured: f.featured,
      });
    });
    var hero = CFG.hero || {};
    var corp = findCalcTier(100000);
    if (corp && hero.fromPriceSms != null) {
      hero.fromPriceSms = corp.pxSMS;
    }
  }

  function loadRemotePricingTiers(done) {
    fetch(PRICING_API + "/api/public/sms-pricing-tiers", {
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data && data.success && data.tiers && data.tiers.length) {
          CALC_TIERS = tiersFromApiResponse(data.tiers);
          CFG.volumeTiers = CALC_TIERS;
          applyBagsFromTiers(data.tiers);
        }
      })
      .catch(function (err) {
        console.warn("[telvoice] pricing tiers API", err);
      })
      .finally(function () {
        if (typeof done === "function") done();
      });
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

  function calcTierRecommendation(vol) {
    var v = snapCalcVolume(vol);
    if (v <= 4000) return "Ideal para validar operación y primeros envíos controlados.";
    if (v <= 9000) return "Buen equilibrio para campañas recurrentes con operación supervisada.";
    if (v <= 49000) return "Tramo recomendado para operación comercial activa.";
    if (v <= 99000) return "Precio unitario optimizado para mayor volumen empresarial.";
    return "Configuración orientada a alto volumen y operación escalada.";
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

  var BAG_TO_PLAN = { "1k": "inicial", "15k": "empresa", "100k": "volumen", "200": "bolsa200" };
  var ONLINE_PLAN_IDS = { inicial: true, empresa: true, volumen: true, calc: true, bolsa200: true };

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
    "No pudimos iniciar el pago en este momento. Intenta nuevamente o contáctanos.";

  var PLAN_PACKAGE_HINTS = {
    inicial: "starter",
    empresa: "business",
    volumen: "corporativo",
    bolsa200: "bolsa chile 200",
  };

  function logCheckoutDebug(ctx, err) {
    console.error("[checkout] debug", {
      selectedPlanId: ctx.planId || null,
      smsQuantity: ctx.smsQuantity != null ? ctx.smsQuantity : null,
      priceAmount: ctx.priceAmount != null ? ctx.priceAmount : null,
      packageId: ctx.packageId || null,
      checkoutEmail: ctx.checkoutEmail || null,
      endpoint: ctx.endpoint || null,
      error: err && err.message ? String(err.message) : String(err || ""),
    });
  }

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

    var agentOrigin = "https://agent.telvoice.cl";
    var agentCheckoutEndpoint = agentOrigin + "/api/public/checkout";
    var legacyCheckoutEndpoint = apiUrl("/api/mercadopago/create-preference");
    var abortController = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeoutId = window.setTimeout(function () {
      if (abortController) abortController.abort();
    }, 45000);

    function parseJsonSafe(res) {
      return parseApiJson(res).then(function (data) {
        return { httpOk: res.ok, status: res.status, data: data };
      });
    }

    function startLegacyCheckout() {
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
      if (legacyCheckoutEndpoint.indexOf("http") !== 0) {
        fetchOpts.credentials = "same-origin";
      }
      return fetch(legacyCheckoutEndpoint, fetchOpts)
        .then(parseJsonSafe)
        .then(function (result) {
          var data = result.data || {};
          var checkoutUrl = resolveCheckoutUrl(data);
          if (!result.httpOk || data.ok === false) {
            throw new Error(data.error || COMPRA_PAY_ERROR);
          }
          if (!checkoutUrl) {
            throw new Error("No se recibió URL de Mercado Pago");
          }
          return checkoutUrl;
        });
    }

    function startAgentCheckout() {
      var debugCtx = {
        planId: planId,
        smsQuantity: compraState.sms,
        priceAmount: compraState.total,
        packageId: null,
        checkoutEmail: email,
        endpoint: agentCheckoutEndpoint,
      };

      if (!compraState.sms || (compraState.sms !== 200 && compraState.sms < 1000)) {
        logCheckoutDebug(debugCtx, new Error("invalid_sms_quantity"));
        throw new Error("Cantidad de SMS no válida para compra online.");
      }

      return fetch(agentCheckoutEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        signal: abortController ? abortController.signal : undefined,
        body: JSON.stringify({
          sms_quantity: compraState.sms,
          product_type: "sms_bundle",
          checkout_email: email,
          payer_email: email,
          payer_name: nombre,
          source: compraState.source || "landing",
        }),
      })
        .then(parseJsonSafe)
        .then(function (r) {
          var data = r.data || {};
          var checkoutUrl = data.checkout_url;
          if (!r.httpOk || data.success !== true) {
            throw new Error((data && (data.error || data.message)) || COMPRA_PAY_ERROR);
          }
          if (!checkoutUrl) {
            throw new Error("No se recibió URL de Mercado Pago");
          }
          return checkoutUrl;
        });
    }

    function allowLegacyFallback() {
      var cfg = window.TELVOICE_CONFIG || {};
      if (cfg.allowLegacyCheckoutFallback === true) return true;
      var pub = window.__TELVOICE_PUBLIC_ENV__ || {};
      var v = pub.NEXT_PUBLIC_ALLOW_LEGACY_CHECKOUT_FALLBACK;
      if (typeof v === "string") {
        v = v.trim().toLowerCase();
        return v === "true" || v === "1" || v === "yes";
      }
      if (v === true) return true;
      return false;
    }

    // Nuevo flujo: intentamos primero el checkout público del agent.
    // Fallback legacy: SOLO si está explícitamente habilitado.
    startAgentCheckout()
      .catch(function (err) {
        if (allowLegacyFallback()) {
          console.warn("[checkout] agent checkout fallback (legacy enabled)", err && (err.message || err));
          return startLegacyCheckout();
        }
        var code = err && err.message ? String(err.message) : "";
        if (code === "agent_package_not_found" || code === "invalid_sms_quantity") {
          throw new Error(
            "Este plan no está disponible para pago online en este momento. Por favor intenta con otra bolsa o contacta a soporte."
          );
        }
        if (code === "agent_products_unavailable") {
          throw new Error(COMPRA_PAY_ERROR);
        }
        throw new Error(COMPRA_PAY_ERROR);
      })
      .then(function (checkoutUrl) {
        trackEvent("click_comprar_online", { planId: planId, source: compraState.source });
        window.location.href = checkoutUrl;
      })
      .catch(function (err) {
        compraSubmitting = false;
        setCompraLoading(false);
        logCheckoutDebug(
          {
            planId: planId,
            smsQuantity: compraState.sms,
            priceAmount: compraState.total,
            packageId: null,
            checkoutEmail: email,
            endpoint: agentCheckoutEndpoint,
          },
          err,
        );
        var msg = COMPRA_PAY_ERROR;
        if (err && err.message === "agent_package_not_found") {
          msg =
            "Este plan no está disponible para pago online en este momento. Por favor intenta con otra bolsa o contacta a soporte.";
        }
        if (err.name === "AbortError") {
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
        scrollToContact({ mensaje: "Solicito información sobre integración vía API." });
      });
    });
    document.querySelectorAll(".empresas-cta").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.preventDefault();
        openAgentForHighVolume("submit_lead_empresa");
      });
    });
    document.querySelectorAll(".comercial-cotizar-cta").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.preventDefault();
        openAgentForHighVolume("click_cotiza_alto_volumen_camino");
      });
    });
    document.querySelectorAll(".comercial-comprar-cta").forEach(function (b) {
      b.addEventListener("click", function () {
        var el = qs("calculadora");
        if (el) scrollToSectionEl(el);
      });
    });
    document.querySelectorAll(".comercial-api-cta").forEach(function (b) {
      b.addEventListener("click", function () {
        scrollToContact({ mensaje: "Solicito información sobre integración vía API." });
      });
    });
  }
  bindDemoButtons();
  bindNavComprarSmsButtons();

  var calcQuoteLink = qs("calc-quote-link");
  if (calcQuoteLink) {
    calcQuoteLink.addEventListener("click", function (e) {
      e.preventDefault();
      openAgentForHighVolume("click_cotiza_alto_volumen");
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
    var corpTier = findCalcTier(100000);
    var fromPx = corpTier ? corpTier.pxSMS : hero.fromPriceSms;
    if (priceEl && fromPx != null) priceEl.textContent = "$" + fromPx;
    if (noteEl && hero.fromPriceNote) noteEl.textContent = hero.fromPriceNote;
  }

  var setCalcVolume = null;

  function initCalculadora() {
    var slider = qs("calcSlider");
    if (!slider) return;

    var calcVol = qs("calcVol");
    var calcQty = qs("calcQty");
    var calcPxSMS = qs("calcPxSMS");
    var calcSubtotal = qs("calcSubtotal");
    var calcIva = qs("calcIva");
    var calcTotal = qs("calcTotal");
    var calcTierLabel = qs("calcTierLabel");
    var calcStatus = qs("calcStatus");
    var buyBtn = qs("calc-buy-btn");
    var suggestionsEl = qs("calcSliderSuggestions");
    var sliderMax = CALC_VOLUMES.length - 1;
    var tierSuggestions = calcTierSuggestionVolumes();
    var lastTrackVol = null;
    var currentVol = 1000;

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
      var tax = Math.round(net * IVA_RATE);
      if (calcQty) calcQty.textContent = fmt(vol) + " SMS";
      if (calcTierLabel) calcTierLabel.textContent = "Bolsa " + fmt(vol) + " SMS";
      if (calcPxSMS) calcPxSMS.textContent = "$" + tier.pxSMS + " + IVA por SMS";
      if (calcSubtotal) calcSubtotal.textContent = "$" + fmt(net);
      if (calcIva) calcIva.textContent = "$" + fmt(tax);
      if (calcTotal) calcTotal.textContent = "$" + fmt(net + tax);
      if (calcStatus) calcStatus.textContent = calcTierRecommendation(vol);

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
        buyBtn.textContent = "Comprar bolsa SMS";
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
      // Botón de pruebas: bolsa fija (no depende del slider/tramos).
      // Total fijo IVA incl. para QA del flujo de compra/login.
      (function addRetail200CalcChip() {
        var cfg = window.TELVOICE_CONFIG || {};
        var bag = cfg.retail200Bag || {};
        var sms = bag.sms || 200;
        var totalInclIva = Math.round((bag.priceNet || 840) * (1 + IVA_RATE));
        var net = bag.priceNet || Math.round(totalInclIva / (1 + IVA_RATE));
        var tax = totalInclIva - net;
        var qaMode = shouldShowRetail200QaChip("");
        var planName = qaMode ? "Bolsa QA 200 SMS" : bag.planName || "Bolsa Chile 200 SMS";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "calc-tier-chip calc-tier-chip--retail200";
        btn.setAttribute("data-volume", String(sms));
        btn.setAttribute("aria-pressed", "false");
        btn.hidden = !shouldShowRetail200QaChip("");
        btn.style.display = shouldShowRetail200QaChip("") ? "" : "none";
        btn.setAttribute(
          "aria-label",
          planName + " · $" + fmt(totalInclIva) + " IVA incl."
        );
        btn.appendChild(document.createTextNode(String(sms) + " SMS"));
        var sub = document.createElement("span");
        sub.className = "calc-tier-chip-sub";
        sub.textContent = qaMode
          ? "$" + fmt(totalInclIva) + " · Solo prueba controlada"
          : "$" + fmt(totalInclIva);
        btn.appendChild(sub);
        btn.addEventListener("click", function () {
          openCompraModal({
            planId: "bolsa200",
            calcSms: null,
            planName: planName,
            sms: sms,
            net_amount: net,
            tax_amount: tax,
            total_amount: totalInclIva,
            source: "calculadora-retail200",
          });
          trackEvent("click_comprar_online", {
            planId: "bolsa200",
            source: "calculadora-retail200",
            volume: sms,
          });
        });
        suggestionsEl.appendChild(btn);
        retail200ChipEl = btn;
        probeRetail200QaFromApi();
      })();

      (function addTestCalcChip() {
        var cfg = window.TELVOICE_CONFIG || {};
        if (cfg.showTestPurchaseChip !== true) {
          return;
        }
        var sms = 200;
        var totalInclIva = 1000;
        var net = Math.round(totalInclIva / (1 + IVA_RATE));
        var tax = totalInclIva - net;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "calc-tier-chip calc-tier-chip--test";
        btn.setAttribute("data-volume", String(sms));
        btn.setAttribute("aria-pressed", "false");
        btn.setAttribute(
          "aria-label",
          "Bolsa prueba " + sms + " SMS · $" + fmt(totalInclIva) + " IVA incl."
        );
        btn.appendChild(document.createTextNode(String(sms) + " SMS"));
        var sub = document.createElement("span");
        sub.className = "calc-tier-chip-sub";
        sub.textContent = "$" + fmt(totalInclIva);
        btn.appendChild(sub);
        btn.addEventListener("click", function () {
          openCompraModal({
            planId: "test200",
            calcSms: null,
            planName: "Bolsa prueba — " + sms + " SMS",
            sms: sms,
            net_amount: net,
            tax_amount: tax,
            total_amount: totalInclIva,
            source: "calculadora-test",
          });
          trackEvent("click_comprar_online", {
            planId: "test200",
            source: "calculadora-test",
            volume: sms,
          });
        });
        suggestionsEl.appendChild(btn);
      })();

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

    slider.value = String(volumeToSliderIndex(1000));
    updateCalc();
  }

  loadRemotePricingTiers(function () {
    initHeroPricing();
    initCalculadora();
  });

  var compraEmailEl = qs("compra-email");
  if (compraEmailEl && !compraEmailEl.dataset.retail200Bound) {
    compraEmailEl.dataset.retail200Bound = "1";
    compraEmailEl.addEventListener("input", function () {
      syncRetail200ChipVisibility((compraEmailEl.value || "").trim());
    });
  }
  syncRetail200ChipVisibility("");

  var heroPriceCta = qs("hero-price-cta");
  if (heroPriceCta) {
    heroPriceCta.addEventListener("click", function (e) {
      var targetVol = parseInt(heroPriceCta.getAttribute("data-calc-volume") || "100000", 10);
      var calcSection = qs("calculadora");
      if (!calcSection) return;
      e.preventDefault();
      scrollToSectionEl(calcSection);
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
        showFormAlert("ok", "Consulta enviada. Te contactaremos pronto para revisar tu requerimiento.");
        return;
      }

      var nombreEmpresa = (qs("lead-nombre").value || "").trim();
      var correo = (qs("lead-correo").value || "").trim();
      var telefono = qs("lead-telefono") ? (qs("lead-telefono").value || "").trim() : "";
      var mensaje = qs("lead-mensaje") ? (qs("lead-mensaje").value || "").trim() : "";
      var nota = qs("lead-nota") ? (qs("lead-nota").value || "").trim() : "";
      var submitBtn = qs("form-submit");

      if (nombreEmpresa.length < 2) {
        showFormAlert("error", "Indique su nombre o el nombre de su empresa.");
        markLeadFieldError("lead-nombre");
        qs("lead-nombre").focus();
        return;
      }
      if (!correo) {
        showFormAlert("error", "Indique un correo de contacto.");
        markLeadFieldError("lead-correo");
        qs("lead-correo").focus();
        return;
      }
      if (!isValidLeadEmail(correo)) {
        showFormAlert("error", "Indique un correo válido.");
        markLeadFieldError("lead-correo");
        qs("lead-correo").focus();
        return;
      }
      if (!mensaje) {
        showFormAlert("error", "Indique un mensaje.");
        markLeadFieldError("lead-mensaje");
        qs("lead-mensaje").focus();
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
      }

      var agentOrigin = (
        (window.TELVOICE_CONFIG && window.TELVOICE_CONFIG.agentApiOrigin) ||
        "https://agent.telvoice.cl"
      ).replace(/\/$/, "");
      var leadPayload = {
        name: nombreEmpresa,
        email: correo,
        phone: telefono || null,
        message: mensaje,
        page_url: window.location.href,
      };

      function submitContactLead(url, body) {
        return fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        });
      }

      function tryAgentContactLead() {
        return submitContactLead(agentOrigin + "/api/public/contact-lead", leadPayload)
          .then(function (result) {
            if (result.ok && result.data && result.data.ok !== false) {
              return result;
            }
            return submitContactLead(agentOrigin + "/api/public/lead", {
              source: "landing_contact",
              name: leadPayload.name,
              email: leadPayload.email,
              phone: leadPayload.phone,
              message: leadPayload.message,
              page_url: leadPayload.page_url,
            });
          });
      }

      tryAgentContactLead()
        .catch(function () {
          return submitContactLead("/api/contact/lead", {
            name: leadPayload.name,
            email: leadPayload.email,
            phone: leadPayload.phone,
            message: leadPayload.message,
            page_url: leadPayload.page_url,
          });
        })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok || !result.data || result.data.ok === false || result.data.success === false) {
            var errMsg =
              (result.data && (result.data.error || result.data.message)) ||
              "No pudimos enviar tu consulta. Intenta nuevamente.";
            if (typeof errMsg === "object" && errMsg.message) errMsg = errMsg.message;
            throw new Error(errMsg);
          }
          trackEvent("submit_lead_empresa", { source: "landing_contact" });
          form.reset();
          showFormAlert(
            "ok",
            result.data.message ||
              "Consulta enviada. Te contactaremos pronto para revisar tu requerimiento.",
          );
        })
        .catch(function (err) {
          showFormAlert(
            "error",
            err && err.message
              ? err.message
              : "No pudimos enviar tu consulta. Intenta nuevamente.",
          );
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
          }
        });
    });
  }

  function setSiteNavDropdownOpen(toggleEl, menuEl, open) {
    if (!toggleEl || !menuEl) return;
    toggleEl.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) menuEl.removeAttribute("hidden");
    else menuEl.setAttribute("hidden", "");
    var wrap = toggleEl.closest(".site-nav-dropdown");
    if (wrap) wrap.classList.toggle("is-open", open);
  }

  function initSiteNavDropdowns() {
    document.querySelectorAll(".site-nav-dropdown").forEach(function (wrap) {
      var toggle = wrap.querySelector(".site-nav-dropdown-toggle");
      var menu = wrap.querySelector(".site-nav-dropdown-menu");
      if (!toggle || !menu) return;

      toggle.addEventListener("click", function (e) {
        e.stopPropagation();
        var willOpen = toggle.getAttribute("aria-expanded") !== "true";
        document.querySelectorAll(".site-nav-dropdown.is-open").forEach(function (other) {
          if (other !== wrap) {
            setSiteNavDropdownOpen(
              other.querySelector(".site-nav-dropdown-toggle"),
              other.querySelector(".site-nav-dropdown-menu"),
              false
            );
          }
        });
        setSiteNavDropdownOpen(toggle, menu, willOpen);
      });
    });

    document.addEventListener("click", function (e) {
      if (e.target.closest(".site-nav-dropdown")) return;
      document.querySelectorAll(".site-nav-dropdown.is-open").forEach(function (wrap) {
        setSiteNavDropdownOpen(
          wrap.querySelector(".site-nav-dropdown-toggle"),
          wrap.querySelector(".site-nav-dropdown-menu"),
          false
        );
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      document.querySelectorAll(".site-nav-dropdown.is-open").forEach(function (wrap) {
        setSiteNavDropdownOpen(
          wrap.querySelector(".site-nav-dropdown-toggle"),
          wrap.querySelector(".site-nav-dropdown-menu"),
          false
        );
      });
    });
  }

  initSiteNavDropdowns();

  function initPreciosTabs() {
    function normalizePreciosHash() {
      var hash = (window.location.hash || "").replace(/^#/, "");
      if (hash === "numeracion-sim" || hash === "sim") {
        history.replaceState(null, "", "#calculadora");
      }
    }

    normalizePreciosHash();
    window.addEventListener("hashchange", normalizePreciosHash);
  }

  initPreciosTabs();

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

  window.TELVOICE_OPEN_CHECKOUT = openCompraModal;
})();
