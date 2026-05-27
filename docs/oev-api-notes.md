# öffentlichevergabe.de API Exploration Notes

This document captures findings from the reverse-engineering and research of the official German public procurement Open Data API (Bekanntmachungsservice) on **oeffentlichevergabe.de**.

---

## 1. API Architecture & Endpoints

The API is officially provided by the *Datenservice Öffentlicher Einkauf* as an Open Data service.

*   **API Base URL:** `https://oeffentlichevergabe.de`
*   **Documentation UI:** [oeffentlichevergabe.de/documentation/swagger-ui/opendata/index.html](https://oeffentlichevergabe.de/documentation/swagger-ui/opendata/index.html)
*   **Authentication:** The Open Data API requires **no authentication/API keys**. It is completely open to the public under the Creative Commons CC Zero (CC0) license.
*   **Rate Limits:** Standard public rate limits apply (approx. 60-120 RPM is safe, managed via our token-bucket rate limiter).

### Key Endpoints

#### A. Export eForms-DE (Bulk Download)
*   **Path:** `/api/notice-exports` or `/api/notice-exports/getExportAsEforms` (referred to as `getExportAsEforms` in Swagger)
*   **HTTP Method:** `GET`
*   **Query Parameters:**
    *   `pubMonth` (string, optional, e.g. `2026-05`): Returns all notice versions published in the specified calendar month.
    *   `pubDay` (string, optional, e.g. `2026-05-27`): Returns all notice versions published in the specified calendar day.
*   **Response Format:** A ZIP package or stream of eForms-DE XML documents (based on the EU eForms schema Regulation 2019/1780).

#### B. Active Tenders Search / Pagination
*   **Path:** `/api/notices` or `/api/opendata/v1/notices`
*   **HTTP Method:** `GET`
*   **Query Parameters:**
    *   `page` (number): Pagination index (0-indexed).
    *   `size` (number): Page size (default 20, max 100).
    *   `query` (string): Optional search string.
*   **Response Format:** JSON list of notice summaries.

---

## 2. Key Data Mapping to `CreateProcurementInput`

The notices are returned in **eForms-DE XML** format or JSON equivalents. The essential fields map directly to our target data schema:

| Target Schema Field | eForms-DE XML Path / JSON Field | Description |
|---|---|---|
| `tender.title` | `/*/cac:ProcurementProject/cbc:Name` | The title of the procurement in German (`de`). |
| `tender.shortDescription` | `/*/cac:ProcurementProject/cbc:Description` | Brief summary of the tender scope. |
| `tender.estimatedValue` | `/*/cac:ProcurementProject/cac:RequestedTenderMetadata/cbc:EstimatedOverallAmount` | Financial value in `EUR`. |
| `tender.documentsUrl` | `/*/cac:TenderingTerms/cac:DocumentsReference/cbc:URI` | **The critical sub-portal URL!** This field carries the direct URL link into DTVP, evergabe.de, NetServer, etc. where documents can be downloaded. |
| `tender.portalUrl` | `/*/cbc:URI` | Human-readable notice landing page on `oeffentlichevergabe.de`. |
| `tender.submissionDetails.deadlineReceiptTenders` | `/*/cac:TenderingProcess/cbc:SubmissionDeadline` | Cutoff date/time for tender submissions (ISO-8601). |
| `contractingBodyArray[0].officialName` | `/*/cac:ContractingParty/cac:Party/cac:PartyName/cbc:Name` | Contracting authority official name. |

---

## 3. Sub-Portal URL Dispatching Strategy

The `tender.documentsUrl` contains the destination domain. In Sprint 2, the **Discovery Layer** (`OevDiscoveryService`) will parse this URL to resolve the correct sub-portal module:

*   Domain: `dtvp.de` → Route to `DtvpModule`
*   Domain: `evergabe.de` → Route to `EvergabeDeModule`
*   Domain: `bi-medien.de` → Route to `BiMedienModule`
*   Domain contains `NetServer` (e.g. `vergabe.hamburgwasser.de/NetServer`) → Route to the shared `NetServer` handler.

Unrecognised domains will be safely logged with a `logger.warn` to allow ongoing operations without breaking the pipeline.
