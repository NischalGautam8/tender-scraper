# PLACSP 🇪🇸 Reconnaissance & WebSphere Stack Analysis

This document details research, analysis, and implementation details for scraping the Spanish national procurement portal **contrataciondelestado.es** (Plataforma de Contratación del Sector Público).

---

## 1. WebSphere Stack Characteristics

*   **Host:** `https://contrataciondelestado.es/`
*   **WAF / Platform:** IBM WebSphere Portal.
*   **Cookie Sensitivity:** The portal is extremely sensitive to **cookie ordering**. The cookies (primarily `JSESSIONID` and session affinity cookies) must be sent in the exact order they were issued by the server in the `Set-Cookie` headers. Out-of-order cookies result in immediate session invalidation (HTTP 403 or redirects to homepage).
*   **CSRF Tokens:** All form submittals and pagination steps rely on matching CSRF/session tokens carried in hidden input fields and detail URLs.

---

## 2. Captcha Strategy

*   **Trigger Conditions:** Deep-linking directly to document download endpoints (`Pliegos`) without a valid session warm-up sequence triggers image captchas.
*   **Session Warm-up**: To avoid captchas, the session must navigate the homepage and publication listing *before* fetching document attachments.
*   **Fallback OCR Solver**: If an image captcha is encountered, the raw image stream is parsed. Tesseract.js (or mock solver helpers) are used to solve simple numeric captchas locally.

---

## 3. Spanish Notice Schema Mapping

Spanish tender mapping to `CreateProcurementInput`:

*   **Expediente Number:** Acts as the native tender ID.
*   **Title:** Mapped to `LocaleObject` under `es`.
*   **Procurement Type:** "Tipo de Contrato" (e.g. Servicios → `SERVICES`, Suministros → `SUPPLIES`).
*   **Estimated Value:** Mapped from "Presupuesto base de licitación" (EUR).
