# Udbud.dk 🇩🇰 Reconnaissance & Cloudflare Bypass

This document details research, analysis, and implementation details for scraping the Danish national procurement portal **Udbud.dk** past its Cloudflare WAF protection.

---

## 1. Cloudflare Protection Analysis

*   **Host:** `https://udbud.dk/`
*   **Protection Level:** Cloudflare Managed Challenge / JS Challenge (Turnstile).
*   **Detection Vectors:**
    *   **Automation flags:** `navigator.webdriver` is set to `true` by default in automated browsers.
    *   **TLS Fingerprinting:** Cloudflare maps the TLS client hello cipher suites and matches them against typical browser profiles. Standard HTTP client libraries (like Axios/Requests) are instantly blocked.
    *   **Rate Limits:** High-volume searching triggers Turnstile interactive challenges.

---

## 2. Bypass Strategy

Our bypass utilizes **Playwright browser automation** with automated environment humanization:
1.  **Stealth browser launch**: Disable blink features (`AutomationControlled`).
2.  **WebDriver override**: Evade simple bot detection scripts by removing `navigator.webdriver` from the browser context before loading pages.
3.  **Cookie extraction**: Load the page, wait for the JS challenge to resolve (~3-5s), and extract `cf_clearance` and `__cf_bm` cookies.
4.  **Cookie reuse**: Supply these cookies to standard Axios GET requests to perform bulk downloads and REST-like scraping. The cookies remain valid for ~25-30 minutes.

---

## 3. Notice Schema Mapping

Danish notice data mapping to `CreateProcurementInput`:

*   **Title:** Mapped from title header to `LocaleObject` under `da`.
*   **Procedure Type:** Mapped from "Udbudsform" (e.g. Offentligt udbud → `OPEN`).
*   **Documents:** notice detail contains a list of attachment anchors pointing directly to documents hosted on `udbud.dk`.
