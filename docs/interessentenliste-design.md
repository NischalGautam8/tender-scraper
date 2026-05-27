# Design Decision: Interessentenliste / Self-Registration Signaling

This document details and justifies our architectural approach for surfacing "buyer must self-register on the Interessentenliste" signals.

---

## 1. Context & Problem Statement

For several major German procurement portals (specifically **DTVP** and **Deutsche eVergabe**), tender document files are publicly accessible and downloadable anonymously. However, anonymous document retrieval is **insufficient** for active bidding.

To be eligible to:
1.  Receive tender updates and critical clarifications.
2.  Submit binding bids.

The bidder must formally register on the portal's **Interessentenliste** (list of interested parties) before a specific registration cutoff. Surfacing this deadline and the need for registration is a key operational requirement for the BOND/JUHUU ingestion pipeline.

---

## 2. Decision: Hybrid Signaling Approach

We have selected a **Hybrid Signaling Approach** that combines schema compliance with an explicit warning payload.

### Dimension A: Schema-Compliant OJEU Mapping (Crucial for Ingestion)
The standard schema contains two native fields perfect for mapping this data without modifying the target JSON schema structure:
1.  **`tender.submissionDetails.deadlineReceiptRequests`**: We populate this field with the Interessentenliste registration cutoff. Under standard OJEU structures, this field stands for the deadline to request participation, matching this use-case perfectly.
2.  **`tender.submissionDetails.electronicSubmissionUrl`**: We populate this field with the direct self-registration landing URL for the tender.

### Dimension B: Explicit Signaling (`alerts.json`)
To ensure that downstream notification engines and human agents can instantly notice this operational constraint without parsing deep nested schema fields, we generate an `alerts.json` file inside the tender folder beside `procurement.json`.

```json
{
  "alerts": [
    {
      "type": "REGISTRATION_REQUIRED",
      "severity": "HIGH",
      "portal": "dtvp",
      "message": "Buyer must self-register on the Interessentenliste before the deadline to participate.",
      "registrationUrl": "https://www.dtvp.de/TenderingProcedureDetails?id=...",
      "deadline": "2026-06-15T12:00:00Z",
      "detectedAt": "2026-05-28T02:00:00Z"
    }
  ]
}
```

---

## 3. Benefits of the Hybrid Approach

1.  **No Schema Bloat:** We keep `procurement.json` 100% compliant with the original target schema definition without introducing non-standard custom fields.
2.  **Downstream Resiliency:** Core systems using standard OJEU parsers automatically ingest `deadlineReceiptRequests` cleanly.
3.  **High Visibility:** Frontends can read `alerts.json` directly to display prominent UI warning banners to human buyers.
