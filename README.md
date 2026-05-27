# 🏗️ EU Tender Portal Scraper (BOND Assessment)

A NestJS-based enterprise-grade EU procurement tender scraper and document downloader designed to bypass anti-bot WAFs (Cloudflare & WebSphere) across 11 portals (9 German portals, 1 Danish portal, and 1 Spanish portal).

---

## 🚀 Key Architectural Highlights

### 1. Dual-Mode Bootstrapping
The application can run in three execution modes:
1. **Server Mode (Default)**: Runs a continuous HTTP server on port `3000` (or `PORT` environment variable) that schedules and executes daily crons using `@nestjs/schedule`.
2. **CLI Mode (On-Demand Scrape)**: Triggered with the `--run-once` flag (via `npm run scrape`), which spins up the NestJS IoC context, executes a complete discovery and document scraping run, writes all files to disk, and gracefully exits.
3. **HTTP Endpoint Trigger**: When running in Server Mode, an endpoint `POST /scrapers/run` triggers the complete scrape execution on-demand.

### 2. Discovery Layer & Dispatcher
* **Discovery Service**: Queries the public listings from `oeffentlichevergabe.de` and maps each tender to its target portal using a registered domain registry mapping.
* **Sub-Portal Dispatcher**: Uses NestJS `ModuleRef` to route each discovered notice to its corresponding portal-specific service using decoupled string tokens.

### 3. Anti-Bot and Bypass Systems
* **Cloudflare Bypass (Udbud.dk 🇩🇰)**: Uses Playwright automation in headless environments with custom JS stealth injection (removing `navigator.webdriver` flags) to obtain `cf_clearance` and `__cf_bm` cookies, passing them to standard HTTP client requests to bypass challenge walls.
* **WebSphere Cookie Ordering (PLACSP 🇪🇸)**: Manages ordered cookie serialization for WebSphere sessions (since out-of-order session cookies on contrataciondelestado.es result in 403 Forbidden responses).
* **Captcha Solver Service**: Simulates a local OCR solver for simple image captchas and allows fallback integration with the 2captcha API via the `twoCaptchaApiKey` env configuration.

### 4. Output Directories & Strict Schema Compliance
All output data is saved under `output/<portal-name>/<tender-id>/`:
* `procurement.json`: Adheres to the strict BOND data schema, ensuring:
  * Only original-language strings are written inside the `LocaleObject` fields (`de` for German, `da` for Danish, `es` for Spanish).
  * No pipeline-owned fields (e.g. `deliverableArray`, `requirementArray`, `winningCompanyIdArray`, `point`, `area`, `uberH3`) are populated.
* `documents/`: Contains all attachments and tender files downloaded from the source portal, preserving original filenames.

---

## 🛠️ Project Setup

### 1. Prerequisites
* **NodeJS**: `v20` or higher recommended.
* **npm**: standard package manager.

### 2. Installation
Install the project dependencies and download the Playwright browser binaries:
```bash
# Install dependencies
$ npm install

# Install Playwright browser engines
$ npx playwright install chromium
```

### 3. Environment Variables
Create a `.env` file (or set these variables in your environment):
```env
NODE_ENV=development
LOG_LEVEL=info
OUTPUT_DIR=./output
PORT=3000
# TWO_CAPTCHA_API_KEY=your_key_here (optional)
```

---

## 🧪 How to Test and Run the Whole App

Follow these step-by-step instructions to verify the entire system:

### Step 1: Run the Schema & Directory Audit (Pre-run check)
Verify the output structure and schema compliance of any existing scraped data:
```bash
$ npm run validate
```
This runs the audit script `src/validate-outputs.ts` and prints a report card:
* Verifies `procurement.json` schema rules (checking that no pipeline-owned fields exist, correct languages in `LocaleObject` fields, etc.).
* Checks that every tender folder contains a `documents/` folder with at least one file.
* Prints a summary of global documents coverage.

### Step 2: Run Unit Tests
Verify that controllers and modules compile and execute successfully:
```bash
$ npm run test
```

### Step 3: Run End-to-End (E2E) Integration Tests
Runs a comprehensive E2E integration test (`test/app.e2e-spec.ts`) that boots the NestJS application, performs mock HTTP requests to the manual trigger endpoint, routes notices to all 11 active portals, runs anti-bot bypass mechanisms, and verifies the file outputs:
```bash
$ npm run test:e2e
```

### Step 4: Run a Manual CLI Scraper Execution
Run the entire scrape cycle from the CLI context and exit upon completion:
```bash
$ npm run scrape
```
This will:
1. Boot the NestJS container in Standalone Context Mode.
2. Trigger the discovery phase.
3. Dispatch notices to all 11 sub-portal services.
4. Download attachments and output `procurement.json` schema files under the `output/` directory.
5. Exit cleanly with code `0`.

### Step 5: Start the HTTP Server and trigger via HTTP
Start the NestJS application in server mode:
```bash
$ npm run start:dev
```
Then in another terminal window, hit the scraper execution endpoint:
```bash
# Linux/macOS
$ curl -X POST http://localhost:3000/scrapers/run

# Windows PowerShell
$ Invoke-RestMethod -Method Post -Uri http://localhost:3000/scrapers/run
```

---

## 📅 Scheduled Daily Crons Inventory

Crons are automatically registered and executed when running in Server Mode:

| Portal | Portal Key | Listing Cron | Document Cron | Language |
|---|---|---|---|---|
| **öffentlichevergabe.de Discovery** | `oev-discovery` | `0 2 * * *` (02:00) | N/A | German (`de`) |
| **bi-medien** | `bi-medien` | `0 3 * * *` (03:00) | `0 5 * * *` (05:00) | German (`de`) |
| **evergabe.de** | `evergabe-de` | `0 3 * * *` (03:00) | `0 5 * * *` (05:00) | German (`de`) |
| **FBHH Hamburg** | `fbhh-hamburg` | `0 3 * * *` (03:00) | `0 5 * * *` (05:00) | German (`de`) |
| **DTVP** | `dtvp` | `0 3 * * *` (03:00) | `0 5 * * *` (05:00) | German (`de`) |
| **Deutsche eVergabe** | `deutsche-evergabe` | `0 3 * * *` (03:00) | `0 5 * * *` (05:00) | German (`de`) |
| **Hamburg Wasser (NetServer)** | `hamburg-wasser` | `0 4 * * *` (04:00) | `0 6 * * *` (06:00) | German (`de`) |
| **Vergabekooperation Berlin** | `vergabekooperation-berlin` | `0 4 * * *` (04:00) | `0 6 * * *` (06:00) | German (`de`) |
| **Sachsen eVergabe** | `sachsen-evergabe` | `0 4 * * *` (04:00) | `0 6 * * *` (06:00) | German (`de`) |
| **Charité Berlin** | `charite-berlin` | `0 4 * * *` (04:00) | `0 6 * * *` (06:00) | German (`de`) |
| **Udbud.dk** | `udbud-dk` | `0 3 * * *` (03:00) | `0 5 * * *` (05:00) | Danish (`da`) |
| **PLACSP** | `placsp-es` | `30 3 * * *` (03:30) | `30 5 * * *` (05:30) | Spanish (`es`) |
