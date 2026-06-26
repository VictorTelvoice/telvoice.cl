/**
 * Google Tag Manager / GA4 para páginas públicas Telvoice.cl
 * Configura gtmContainerId en telvoice-config.js o GTM_CONTAINER_ID en __TELVOICE_PUBLIC_ENV__
 */
(function () {
  "use strict";

  window.dataLayer = window.dataLayer || [];

  function readEnv(key) {
    var pub = window.__TELVOICE_PUBLIC_ENV__ || {};
    var v = pub[key];
    return typeof v === "string" ? v.trim() : "";
  }

  function readConfig(key) {
    var cfg = window.TELVOICE_CONFIG || {};
    var v = cfg[key];
    return typeof v === "string" ? v.trim() : v || "";
  }

  function loadGtm(containerId) {
    if (!containerId || window.__TELVOICE_GTM_LOADED__) return;
    window.__TELVOICE_GTM_LOADED__ = true;
    window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtm.js?id=" + encodeURIComponent(containerId);
    document.head.appendChild(s);
  }

  function loadGtag(measurementId) {
    if (!measurementId || window.__TELVOICE_GTAG_LOADED__) return;
    window.__TELVOICE_GTAG_LOADED__ = true;
    var s = document.createElement("script");
    s.async = true;
    s.src =
      "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
    document.head.appendChild(s);
    window.gtag =
      window.gtag ||
      function () {
        window.dataLayer.push(arguments);
      };
    window.gtag("js", new Date());
    window.gtag("config", measurementId, { send_page_view: true });
  }

  var gtmId = readEnv("GTM_CONTAINER_ID") || readConfig("gtmContainerId");
  var gtagId = readEnv("GTAG_MEASUREMENT_ID") || readConfig("gtagMeasurementId");

  if (gtmId) loadGtm(gtmId);
  if (gtagId) loadGtag(gtagId);

  window.TelvoiceTrack = window.TelvoiceTrack || function (name, detail) {
    if (!name) return;
    try {
      if (typeof window.gtag === "function") {
        window.gtag("event", name, detail || {});
      }
      window.dataLayer.push(Object.assign({ event: name }, detail || {}));
    } catch (err) {
      console.warn("[TelvoiceTrack]", err);
    }
  };
})();
