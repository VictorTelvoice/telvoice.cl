/**
 * Telvoice.cl — calculadora, planes, formularios y analytics hooks
 */
(function () {
  "use strict";

  const config = window.TELVOICE_CONFIG;
  if (!config) return;

  const { smsPlans, ivaRate } = config;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const fmt = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });

  function formatMoney(n) {
    return fmt.format(Math.round(n));
  }

  function getPlanByQuantity(qty) {
    return smsPlans.find((p) => p.quantity === qty) || smsPlans[0];
  }

  function getDefaultPlan() {
    return smsPlans.find((p) => p.recommended) || smsPlans[0];
  }

  function calcPricing(plan) {
    if (!plan || plan.quoteOnly || plan.priceNet == null) {
      return null;
    }
    const net = plan.priceNet;
    const iva = Math.round(net * ivaRate);
    const total = net + iva;
    const perSms = net / plan.quantity;
    const basePlan = smsPlans.find((p) => p.priceNet != null && !p.quoteOnly);
    let savingsPercent = 0;
    if (basePlan && plan.quantity > basePlan.quantity) {
      const basePerSms = basePlan.priceNet / basePlan.quantity;
      savingsPercent = Math.max(
        0,
        Math.round((1 - perSms / basePerSms) * 100)
      );
    }
    return { net, iva, total, perSms, savingsPercent };
  }

  function trackEvent(name, detail = {}) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name, ...detail });
    if (typeof window.gtag === "function") {
      window.gtag("event", name, detail);
    }
    document.dispatchEvent(
      new CustomEvent("telvoice:" + name, { detail })
    );
  }

  let selectedQuantity = getDefaultPlan().quantity;

  function updateCalculatorUI() {
    const plan = getPlanByQuantity(selectedQuantity);
    const pricing = calcPricing(plan);
    const isQuote = plan.quoteOnly || plan.priceNet == null;

    $$("[data-calc-label]").forEach((el) => {
      el.textContent = plan.label;
    });

    const netEl = $("[data-calc-net]");
    const ivaEl = $("[data-calc-iva]");
    const totalEl = $("[data-calc-total]");
    const perSmsEl = $("[data-calc-per-sms]");
    const savingsEl = $("[data-calc-savings]");
    const savingsWrap = $("[data-calc-savings-wrap]");
    const buyBtn = $("[data-action-buy]");
    const quoteBtn = $("[data-action-quote]");
    const buyBlock = $("[data-buy-block]");
    const quoteBlock = $("[data-quote-block]");

    if (isQuote) {
      if (netEl) netEl.textContent = "—";
      if (ivaEl) ivaEl.textContent = "—";
      if (totalEl) totalEl.textContent = "Cotización";
      if (perSmsEl) perSmsEl.textContent = "—";
      if (savingsWrap) savingsWrap.classList.add("hidden");
      if (buyBlock) buyBlock.classList.add("hidden");
      if (quoteBlock) quoteBlock.classList.remove("hidden");
    } else if (pricing) {
      if (netEl) netEl.textContent = formatMoney(pricing.net);
      if (ivaEl) ivaEl.textContent = formatMoney(pricing.iva);
      if (totalEl) totalEl.textContent = formatMoney(pricing.total);
      if (perSmsEl)
        perSmsEl.textContent = formatMoney(pricing.perSms) + " / SMS";
      if (savingsWrap) {
        if (pricing.savingsPercent > 0) {
          savingsWrap.classList.remove("hidden");
          if (savingsEl)
            savingsEl.textContent =
              "Ahorras ~" + pricing.savingsPercent + "% vs. bolsa inicial";
        } else {
          savingsWrap.classList.add("hidden");
        }
      }
      if (buyBlock) buyBlock.classList.remove("hidden");
      if (quoteBlock) quoteBlock.classList.add("hidden");
    }

    $$("[data-plan-option]").forEach((btn) => {
      const q = Number(btn.dataset.planQuantity);
      const active = q === selectedQuantity;
      btn.classList.toggle("border-primary", active);
      btn.classList.toggle("bg-surface-container-low", active);
      btn.classList.toggle("ring-2", active);
      btn.classList.toggle("ring-primary/30", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });

    $$("[data-plan-card]").forEach((card) => {
      const q = Number(card.dataset.planQuantity);
      card.classList.toggle("ring-2", q === selectedQuantity);
      card.classList.toggle("ring-primary", q === selectedQuantity);
    });
  }

  function selectPlan(quantity, source) {
    selectedQuantity = quantity;
    trackEvent("select_sms_plan", {
      quantity,
      source: source || "calculator",
    });
    updateCalculatorUI();
    const mainCalc = $("#calculadora");
    if (source !== "calculator" && mainCalc) {
      mainCalc.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function handleBuy(plan) {
    trackEvent("click_comprar_bolsa", {
      quantity: plan.quantity,
      label: plan.label,
    });
    if (config.checkoutUrl) {
      const url = new URL(config.checkoutUrl, window.location.origin);
      url.searchParams.set("plan", plan.id);
      url.searchParams.set("qty", String(plan.quantity));
      window.location.href = url.toString();
      return;
    }
    const contact = $("#contacto");
    const packSelect = $("#contact-pack");
    if (packSelect) {
      packSelect.value = plan.label;
    }
    if (contact) {
      contact.scrollIntoView({ behavior: "smooth" });
      const note = $("#contact-msg");
      if (note && !note.value) {
        note.value =
          "Quiero comprar la bolsa " +
          plan.label +
          ". Avísenme cuando el pago online esté disponible.";
      }
    } else {
      window.alert(
        "Pago online en activación. Déjanos tus datos en Contacto y te enviamos el link de compra para " +
          plan.label +
          "."
      );
    }
  }

  function initPlanSelectors() {
    $$("[data-plan-option]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectPlan(Number(btn.dataset.planQuantity), "selector");
      });
    });

    $$("[data-select-plan]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const q = Number(btn.dataset.selectPlan);
        selectPlan(q, btn.dataset.source || "card");
        if (btn.dataset.action === "buy") {
          handleBuy(getPlanByQuantity(q));
        } else if (btn.dataset.action === "quote") {
          trackEvent("click_cotizar_volumen", { quantity: q });
          const emp = $("#empresas");
          if (emp) emp.scrollIntoView({ behavior: "smooth" });
        }
      });
    });

    $$("[data-action-buy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        handleBuy(getPlanByQuantity(selectedQuantity));
      });
    });

    $$("[data-action-quote]").forEach((btn) => {
      btn.addEventListener("click", () => {
        trackEvent("click_cotizar_volumen", {
          quantity: selectedQuantity,
        });
        const emp = $("#empresas");
        if (emp) emp.scrollIntoView({ behavior: "smooth" });
      });
    });

    $$("[data-track]").forEach((el) => {
      el.addEventListener("click", () => {
        trackEvent(el.dataset.track, {
          href: el.getAttribute("href") || "",
        });
      });
    });
  }

  function initMobileNav() {
    const toggle = $("#nav-toggle");
    const menu = $("#nav-menu");
    if (!toggle || !menu) return;
    toggle.addEventListener("click", () => {
      menu.classList.toggle("hidden");
      const isHidden = menu.classList.contains("hidden");
      toggle.setAttribute("aria-expanded", isHidden ? "false" : "true");
    });
    $$("#nav-menu a").forEach((a) => {
      a.addEventListener("click", () => {
        menu.classList.add("hidden");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  function initFaq() {
    $$("[data-faq-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const panel = btn.nextElementSibling;
        const expanded = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", expanded ? "false" : "true");
        panel.classList.toggle("hidden", expanded);
        const icon = btn.querySelector(".faq-icon");
        if (icon) icon.textContent = expanded ? "add" : "remove";
      });
    });
  }

  function initForms() {
    const enterpriseForm = $("#form-empresas");
    if (enterpriseForm) {
      enterpriseForm.addEventListener("submit", (e) => {
        e.preventDefault();
        trackEvent("submit_lead_empresa", {
          volume: $("#emp-volume")?.value || "",
        });
        window.alert(
          "Gracias. Un ejecutivo Telvoice revisará tu volumen y te contactará a la brevedad."
        );
        enterpriseForm.reset();
      });
    }

    const contactForm = $("#form-contacto");
    if (contactForm) {
      contactForm.addEventListener("submit", (e) => {
        e.preventDefault();
        trackEvent("submit_lead_empresa", { type: "contacto" });
        window.alert(
          "Recibimos tu solicitud. Te contactaremos con los siguientes pasos para activar tu bolsa."
        );
        contactForm.reset();
      });
    }

    const apiBtn = $("#btn-api-request");
    if (apiBtn) {
      apiBtn.addEventListener("click", () => {
        trackEvent("click_api_request");
        const contact = $("#contacto");
        const packSelect = $("#contact-pack");
        const msg = $("#contact-msg");
        if (packSelect) packSelect.value = "Acceso API";
        if (msg)
          msg.value =
            "Solicito acceso API para integrar envíos SMS desde nuestro sistema.";
        if (contact) contact.scrollIntoView({ behavior: "smooth" });
      });
    }

    const wa = $("[data-whatsapp]");
    if (wa && config.whatsappUrl) {
      wa.href = config.whatsappUrl;
      wa.addEventListener("click", () => trackEvent("click_whatsapp"));
    } else if (wa) {
      wa.classList.add("hidden");
    }
  }

  function renderPlanCards() {
    const grid = $("#plans-grid");
    if (!grid) return;

    grid.innerHTML = smsPlans
      .map((plan) => {
        const pricing = calcPricing(plan);
        const isQuote = plan.quoteOnly || plan.priceNet == null;
        const priceHtml = isQuote
          ? '<p class="font-h3 text-h3 text-primary mt-4">Cotizar</p>'
          : pricing
            ? `<p class="font-h3 text-h3 text-primary mt-4">${formatMoney(pricing.net)} <span class="text-[14px] font-normal text-on-surface-variant">+ IVA</span></p>
               <p class="font-body-sm text-body-sm text-on-surface-variant">${formatMoney(pricing.total)} total</p>`
            : "";
        const badge = plan.recommended
          ? '<span class="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-secondary-container px-3 py-1 font-label-caps text-label-caps uppercase tracking-wider text-on-secondary-container">Más elegido</span>'
          : "";
        const border = plan.recommended
          ? "border-2 border-secondary-container shadow-[0px_10px_30px_rgba(15,23,42,0.08)]"
          : "border border-outline-variant";
        const ctaLabel = isQuote ? "Cotizar volumen" : "Comprar";
        const ctaAction = isQuote ? "quote" : "buy";

        return `
        <article data-plan-card data-plan-quantity="${plan.quantity}" class="relative flex flex-col rounded-xl ${border} bg-surface-container-lowest p-6 transition-all">
          ${badge}
          <h3 class="font-h3 text-h3 text-on-background ${plan.recommended ? "mt-2" : ""}">${plan.label}</h3>
          <p class="mt-2 flex-1 font-body-sm text-body-sm text-on-surface-variant">${plan.cardDescription}</p>
          ${priceHtml}
          <button type="button" data-select-plan="${plan.quantity}" data-action="${ctaAction}" data-source="plans" class="mt-6 w-full rounded-xl ${plan.recommended ? "bg-primary text-on-primary hover:bg-surface-tint" : "bg-surface-container-high text-primary hover:bg-surface-variant"} py-2.5 font-body-sm font-semibold transition-colors">
            ${ctaLabel}
          </button>
        </article>`;
      })
      .join("");

  }

  function initYear() {
    const y = $("#y");
    if (y) y.textContent = new Date().getFullYear();
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderPlanCards();
    initPlanSelectors();
    updateCalculatorUI();
    initMobileNav();
    initFaq();
    initForms();
    initYear();

    $$("[data-scroll-calc]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        trackEvent("click_calcular_precio");
        $("#calculadora")?.scrollIntoView({ behavior: "smooth" });
      });
    });
  });
})();
