**Technical Assessment --- EU Tender Portal Scrapers**

*3-week side project · 10 shortlisted candidates · winner joins us
long-term after our funding round*

# Why you got this

Hello --- and first of all, thank you. We received 2,250 applications
for this position. We sat down and went through every single
prequalification carefully, and yours genuinely stood out. That is the
reason you are one of only ten people in the world receiving this
message today, and we are very happy that you made it this far.

This message is a very polite ask: we would love it if you would take on
the final assessment described below. We understand that it may not be
possible for everyone --- life is busy, you may have other commitments,
university, family, an existing job. If now is not the right time for
you, that is completely OK. Tell us, and we will close your file warmly
with our thanks. There is no negative mark, no impact on anything else,
and we would still wish you the very best.

The reason we are being this thorough about the final step is simple: we
genuinely want to bring someone into the team who stays with us
full-time, long-term. We are a small team and the next person we hire
matters a lot to us --- both for them and for us --- so we want to be
sure on both sides.

On compensation and timing, we want to be fully transparent with you. We
are currently in the middle of a funding round with a target volume of
€1,000,000, and we expect the first inflows in about three months. From
the moment the funding closes, whoever wins this assessment receives a
fixed monthly salary of €1,000--2,500, depending on performance and
skill --- full-time immediately, or part-time alongside studies if that
fits your life better. If this compensation range does not match what
you need today, that is completely understandable and we ask you to tell
us openly so we don\'t waste anyone\'s time.

If everything in here sounds like something you\'d like to be a part of
--- please dive in. We\'re very much looking forward to seeing what you
build.

# The task

This assessment has two parts:

-   Part 1 --- Compulsory: Germany. Use the oeffentlichevergabe.de
    public API as a discovery layer, then follow the links into the
    German sub-portals and download the actual tender documents. Details
    below.

-   Part 2 --- Pick at least 2 foreign portals from the list further
    down. We deliberately want you to choose the ones that look hardest
    to you --- that is where we see what you are made of.

In both parts you build a NestJS module per portal that scrapes tender
listings AND downloads all tender documents. The document downloads are
the heart of this assessment --- getting the actual files (PDFs, ZIPs,
Excel, DWG, etc.) onto disk matters more than anything else. The schema
JSON is supporting metadata; the files are what we need. The scraper
must run automatically once per day.

# Stack --- what you build

You build a NestJS service that mirrors the structure of our production
scraper. Use the conventions below --- they are the same conventions we
use internally, and they are non-negotiable because the eventual goal is
that your code merges into our production repo.

-   NestJS application. Each portal (or sub-portal) = one NestJS module.
    Look at how Nest modules typically wire up service + controller +
    cron --- same pattern.

-   Two cron jobs per module: (1) Listing cron --- walks the portal/API,
    finds procurements, writes one procurement.json (matching our
    schema) per tender into
    output/\<portal\>/\<tender-id\>/procurement.json. (2) Document cron
    --- for each tender, downloads ALL referenced documents into
    output/\<portal\>/\<tender-id\>/documents/, preserving the original
    filenames the portal uses. The document cron is the most important
    part of the assessment. If a tender has documents and you don\'t end
    up with them on disk, that tender counts as not done --- no matter
    how clean the JSON is.

-   Output layout: everything goes to a local output/ directory. One
    subfolder per portal, one subfolder per tender (use the portal\'s
    native tender ID as the folder name), containing procurement.json
    plus a documents/ folder with every downloaded file. Keep the
    original filenames from the portal where possible --- they often
    carry context (e.g. CCAP.pdf, RC.pdf, DCE.zip in PLACE). No HTTP
    calls out to JUHUU systems, no API keys, nothing to configure beyond
    the output path.

-   Use npm for installing packages. Use await --- no .then() /
    .catch().

-   Logging: \@InjectPinoLogger from nestjs-pino, call
    this.logger.info(\...). Add comments and log statements at every
    meaningful step --- we read your logs as part of the evaluation.

-   Config: no .env file, no dotenv. All env vars go through a
    TypedConfigService wrapper. To add a new env var: extend
    RawEnvSchema + EnvType + the validate() function in
    src/config/env.schema.ts, then add a getter on TypedConfigService.
    For your dev environment use Doppler or plain env vars --- your
    call, but mirror this shape.

-   Everything runs locally on your machine. No deployment, no shared
    infrastructure, no JUHUU systems to talk to. Schedule the daily run
    however you like --- node-cron inside the app, a system crontab, a
    launchd job, your choice --- as long as the daily run actually
    happens for the 3 weeks.

# Part 1 --- Compulsory: Germany via öffentliche-Vergabe + sub-portals

In Germany almost every public Bekanntmachung flows through
oeffentlichevergabe.de, but that portal itself only carries the
announcement metadata --- the actual tender documents live on whichever
sub-portal the buyer uses (DTVP, NetServer/Cosinex-based portals,
evergabe.de, bi-medien, regional/city portals, etc.).

So the sensible architecture, and the one we expect you to build, is
two-layered:

-   Discovery layer: integrate the public oeffentlichevergabe.de API (we
    will send you the API spec with your Day 0 confirmation). Its
    listing endpoint gives you every German Bekanntmachung as it comes
    in, with the sub-portal URL attached to each one.

-   Document layer: for each Bekanntmachung, follow the sub-portal link
    and use the portal-specific module to download the actual documents
    into output/\<sub-portal\>/\<tender-id\>/documents/.

This should go reasonably quickly --- most sub-portals are easier than
the foreign ones --- but it is the mandatory baseline. Below is a
representative list of sub-portals you will encounter and need to
handle. Real-world traffic will of course bring more --- your discovery
layer should not break when a new sub-portal appears, it should just log
it and move on.

**German sub-portals you must support**

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Sub-portal**            **URL**                                                                                               **Notes**
  ------------------------- ----------------------------------------------------------------------------------------------------- -----------------------------------------------
  **DTVP (Deutsches         [[dtvp.de]{.underline}](https://www.dtvp.de/)                                                         Docs downloadable anonymously, but bidders must
  Vergabeportal)**                                                                                                                self-register on the Interessentenliste before
                                                                                                                                  the request deadline to actually receive
                                                                                                                                  updates and participate. See note below.

  **Deutsche eVergabe**     [[deutsche-evergabe.de]{.underline}](https://www.deutsche-evergabe.de/)                               Same pattern as DTVP --- anonymous doc
                                                                                                                                  download, but participation requires
                                                                                                                                  self-registration on the tender.

  **evergabe.de**           [[evergabe.de]{.underline}](https://www.evergabe.de/)                                                 No registration required for document access
                                                                                                                                  (\`/unterlagen/{id}/zustellweg-auswaehlen\`).
                                                                                                                                  Straightforward.

  **bi-medien               [[bi-medien.de]{.underline}](https://bi-medien.de/ausschreibungsdienste/)                             No registration required. Basic scraper ---
  Ausschreibungsdienste**                                                                                                         easiest of the German sub-portals.

  **Hamburg Wasser          [[vergabe.hamburgwasser.de/NetServer]{.underline}](https://vergabe.hamburgwasser.de/NetServer/)       NetServer-based (Cosinex). Common architecture
  (NetServer)**                                                                                                                   you will see repeatedly across municipal
                                                                                                                                  portals.

  **Freie und Hansestadt    [[fbhh-evergabe.web.hamburg.de]{.underline}](https://fbhh-evergabe.web.hamburg.de/evergabe.bieter/)   Hamburg city supplier portal --- bidder area.
  Hamburg (eVergabe)**                                                                                                            

  **Charité Berlin**        [[vergabeplattform.charite.de]{.underline}](https://vergabeplattform.charite.de/)                     Single-buyer portal of Berlin\'s Charité
                                                                                                                                  hospital group.

  **Vergabekooperation      [[vergabekooperation.berlin/NetServer]{.underline}](https://vergabekooperation.berlin/NetServer/)     Berlin federal-state cooperation portal.
  Berlin (NetServer)**                                                                                                            

  **Sachsen eVergabe        [[evergabe.sachsen.de/NetServer]{.underline}](https://www.evergabe.sachsen.de/NetServer/)             Saxony state portal --- NetServer/Cosinex
  (NetServer)**                                                                                                                   architecture.
  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Important --- the DTVP / Deutsche eVergabe / Interessentenliste case**

For DTVP and Deutsche eVergabe specifically (and similar Cosinex-based
portals), the documents can be downloaded anonymously --- but anonymous
download is NOT enough for a real bidder to participate. To actually be
eligible to receive updates, clarifications and to submit an offer, our
customer (the buyer using JUHUU) must register themselves on the
tender\'s Interessentenliste before the registration deadline.

Your system has to handle this realistically: we want both halves
working together.

-   Half 1 --- Scrape and download all documents as usual, so the buyer
    can review the tender contents.

-   Half 2 --- Detect when a portal requires bidder self-registration on
    an Interessentenliste, and surface that clearly so the buyer can act
    in time. In particular, the relevant deadline --- the cutoff to
    register as an Interessent --- should land in
    submissionDetails.deadlineReceiptRequests (this OJEU field is
    exactly the request-to-participate deadline).

How exactly you surface the \"the buyer must self-register here before
X\" signal is part of the assessment --- there is no single right
answer. Some sensible options: add a small alert/action field next to
submissionDetails, write a separate alerts.json beside procurement.json,
or just be very disciplined about populating deadlineReceiptRequests +
electronicSubmissionUrl on the portals where it applies. Pick one,
justify it briefly in your README, and stay consistent.

This question --- anonymous-doc-access vs.
participation-requires-registration --- repeats across many German
portals. Solving it well in your output design is part of what we
evaluate.

# Part 2 --- Pick at least 2 foreign portals

Below is our internal grouping of European national portals by
difficulty. All of them serve their tender documents directly (no
third-party redirects), and all of them are protected by some
combination of CAPTCHAs, WAFs (Cloudflare/Akamai) or login walls. Pick
at least two --- we strongly encourage you to pick from the harder
tiers. The candidates who solve a Tier C portal are the candidates we
will fight to hire.

Tier A --- WAF / Cloudflare stealth test. Tier B --- Login +
Captcha-solver test. Tier C --- Identity-wall (eIDAS/SPID) --- the hard
limit of pure software automation.

  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Tier**   **Country**   **Portal**       **URL**                                                                                 **Anti-Bot         **Doc-Download**
                                                                                                                                    Mechanism**        
  ---------- ------------- ---------------- --------------------------------------------------------------------------------------- ------------------ ------------------
  **A**      **DK**        Udbud.dk         [[udbud.dk]{.underline}](https://udbud.dk/)                                             Aggressive         Docs directly
                                                                                                                                    Cloudflare. Needs  attached to
                                                                                                                                    a fully simulated  notices.
                                                                                                                                    browser profile    
                                                                                                                                    (cookies,          
                                                                                                                                    TLS-fingerprint)   
                                                                                                                                    to scale.          

  **A**      **BE**        e-Notification   [[enot.publicprocurement.be]{.underline}](https://enot.publicprocurement.be/)           Dynamic session    PDF/ZIP usually
                           (BOSA)                                                                                                   tokens +           anonymous.
                                                                                                                                    occasional         
                                                                                                                                    captchas on hot    
                                                                                                                                    endpoints.         
                                                                                                                                    Rate-limit         
                                                                                                                                    aggressive.        

  **A**      **NL**        TenderNed        [[tenderned.nl]{.underline}](https://www.tenderned.nl/)                                 reCAPTCHA kicks in PDFs on the notice
                                                                                                                                    at high search     page itself.
                                                                                                                                    volume + general   
                                                                                                                                    bot-detection.     

  **B**      **FR**        PLACE            [[marches-publics.gouv.fr]{.underline}](https://www.marches-publics.gouv.fr/)           Image-captcha      DCE as ZIP (PDF +
                                                                                                                                    before every       Excel + DWG).
                                                                                                                                    anonymous DCE      
                                                                                                                                    download.          
                                                                                                                                    Alternative:       
                                                                                                                                    bidder login (also 
                                                                                                                                    rate-limited).     

  **B**      **PL**        e-Zamówienia     [[ezamowienia.gov.pl]{.underline}](https://ezamowienia.gov.pl/)                         JS-heavy SPA, hard Full files only
                                                                                                                                    captchas at        after free bidder
                                                                                                                                    registration,      login.
                                                                                                                                    strict session     
                                                                                                                                    monitoring.        

  **B**      **RO**        SEAP / SICAP     [[e-licitatie.ro]{.underline}](https://www.e-licitatie.ro/)                             Custom math/text   PDFs in the bidder
                           (e-Licitatie)                                                                                            captchas + brutal  area.
                                                                                                                                    IP throttling.     
                                                                                                                                    Caiet de sarcini   
                                                                                                                                    behind login.      

  **B**      **HU**        EKR              [[ekr.gov.hu]{.underline}](https://ekr.gov.hu/)                                         Hard CSRF +        All PDFs after
                                                                                                                                    captcha on         login.
                                                                                                                                    registration and   
                                                                                                                                    login. Documents   
                                                                                                                                    in EKR system      
                                                                                                                                    directly.          

  **C**      **ES**        PLACSP           [[contrataciondelestado.es]{.underline}](https://contrataciondelestado.es/)             Old WebSphere      Pliegos directly
                                                                                                                                    stack ---          on ministry
                                                                                                                                    sensitive to       servers.
                                                                                                                                    cookie order. Rate 
                                                                                                                                    limits + captcha   
                                                                                                                                    on deeper          
                                                                                                                                    endpoints.         

  **C**      **IT**        Sintel / MePA    [[sintel.regione.lombardia.it]{.underline}](https://www.sintel.regione.lombardia.it/)   SPID / eIDAS       PDFs in system,
                                                                                                                                    required for the   but
                                                                                                                                    protected document identity-walled.
                                                                                                                                    areas --- perfect  
                                                                                                                                    to test the limit  
                                                                                                                                    of pure software   
                                                                                                                                    tricks.            
  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------

*Note on Italy (Sintel): the platform supports Italian digital ID (SPID)
which you cannot get. Use the classic username/password registration
path --- it works for non-Italian users and is itself worth a row in
your assessment.*

# Target data schema

Every scraped procurement goes into the same CreateProcurementInput
shape. We will receive the same payload from 10 candidates --- schema
deviation makes us unable to compare you fairly, which costs you the
role. Be precise.

> Write: output/\<portal\>/\<tender-id\>/procurement.json
>
> Schema: CreateProcurementInput (one object per file)
>
> Each CreateProcurementInput object:
>
> {
>
> sourceArray: \[
>
> {
>
> // discriminator depends on portal (e.g. PlaceSource, BoampSource,
> \...).
>
> // Pick the right one for your portal and fill ALL identifier fields
>
> // --- this drives deduplication in our pipeline, so get it right.
>
> \_\_type: \"\<PortalName\>Source\",
>
> \<identifier fields specific to portal\>
>
> }
>
> \],
>
> tender: {
>
> status: \"OPEN\" \| \"AWARDED\" \| \"CANCELLED\" \| \...,
>
> title: LocaleObject, // only original-language locale
>
> shortDescription: LocaleObject,
>
> longDescription: LocaleObject,
>
> procurementType: string,
>
> procedureType: string,
>
> estimatedValue: { amount: number, currency: \"EUR\" \| \... } \| null,
>
> cpvCodeArray: string\[\],
>
> languageCodeArray: string\[\], // e.g. \[\"fr\"\] for PLACE
>
> documentsUrl: string, // REQUIRED --- your document
>
> // cron uses this to fetch the
>
> // actual files --- the main deliverable
>
> portalUrl: string, // human-readable notice page, NOT API URL
>
> submissionUrl: string \| null,
>
> canBidOnIndividualLots: boolean \| null,
>
> variantTendersAllowed: boolean \| null,
>
> isFrameworkAgreement: boolean \| null,
>
> biddingConsortiumAllowed: boolean \| null,
>
> subcontractingPolicy: string \| null,
>
> awardCriteriaArray: \[\...\] \| \[\],
>
> submissionDetails: {
>
> deadlineReceiptTenders: ISO-8601 \| null,
>
> deadlineReceiptRequests: ISO-8601 \| null, // ← Interessenten-deadline
>
> deadlineClarificationRequest: ISO-8601 \| null,
>
> allowedLanguageCodeArray: string\[\],
>
> electronicSubmissionRequired: boolean \| null,
>
> electronicSubmissionUrl: string \| null,
>
> tenderValidityDays: number \| null,
>
> openingDate: ISO-8601 \| null,
>
> openingPlace: string \| null,
>
> openingDescription: LocaleObject \| null
>
> },
>
> reviewInformation: { /\* all fields: body name, address, contact,
> deadlines \*/ },
>
> lotArray: \[
>
> {
>
> label, number, title, shortDescription, longDescription,
>
> duration: { startDate, endDate },
>
> location: { description, address, nutsCodes }, // NO point/area/uberH3
>
> estimatedValue, cpvCodeArray,
>
> submissionDetails: { \... same shape as above \... }
>
> }
>
> \]
>
> },
>
> contractingBodyArray: \[
>
> {
>
> officialName, nationalRegistrationNumber,
>
> location: { description, address, nutsCodes }, // NO point/area/uberH3
>
> contact: { contactPoint, email, telephone, url },
>
> organisationType, mainActivity, isMain
>
> }
>
> \],
>
> // Only if the source publishes award results:
>
> award: {
>
> totalValue,
>
> lotAwardArray: \[
>
> { label, title, totalValue, awardDate, tendersReceived }
>
> // NO winningCompanyIdArray --- leave blank, resolved later in our
> pipeline
>
> \]
>
> }
>
> }

**Field-ownership rules**

If a field is in the schema above AND your portal exposes it, scrape it.
If the portal does not expose it, leave it null / empty array --- we
extract these from the tender documents later in our pipeline (which is
exactly why downloading the documents matters more than padding the
JSON). You map source-portal fields INTO our schema. Do not invent your
own fields, with the one explicit exception of the
Interessentenliste/self-registration signal discussed above.

For LocaleObject fields (title, descriptions, openingDescription): fill
ONLY the original-language locale (e.g. de for German portals, fr for
PLACE, pl for e-Zamówienia). We translate to en later in our pipeline.
Do not pre-fill other languages.

**Do NOT scrape --- these are filled later in our pipeline**

Pre-filling these fields collides with later pipeline steps that own
them. Leave them null / undefined / unset --- even an empty array is
fine, but a value is not.

> embedding (any field) → embedding step (voyage-4-lite)
>
> locale translations → translation step
>
> (fill ONLY original language)
>
> lotArray\[\].deliverableArray → extraction agent
>
> lotArray\[\].requirementArray → matching service
>
> location.{point, area, uberH3} → geo-enrichment step
>
> award.lotAwardArray\[\].winningCompanyIdArray → company-resolution
> service
>
> status transitions / createdAt /
>
> updatedAt / version → ingestion pipeline
>
> document chunks / IDs / extracted text → we handle this later

# How we evaluate you

We are picking the candidate we want to work with for the next 5 years,
not the one who scrapes the most rows. Concretely:

-   Part 1 (Germany) actually working end-to-end via the
    öffentliche-Vergabe API + the sub-portals. This is the floor.

-   Part 2 --- quality of the foreign portals you picked. Tier C beats
    Tier A for tied scores.

-   Documents on disk --- listings AND, above all, files actually
    downloaded. A portal with 100% of tenders found but 0% of files
    downloaded is a failed portal.

-   How you handled the Interessentenliste / self-registration question
    --- design choice, justification, consistency.

-   Robustness --- does your daily run still work in week 3, or did it
    silently break in week 1?

-   Code quality --- readable modules, sensible naming, clean
    service/controller separation, log statements at every meaningful
    step.

-   Schema fidelity --- fields correctly mapped, LocaleObject only in
    original language, no pre-filled pipeline-owned fields.

-   Anti-bot creativity --- clean solutions beat throwing 2captcha at
    everything.

-   Operational thinking --- retries, error handling, monitoring.

-   Communication --- sharp questions when something is ambiguous beats
    silent guessing.

# Process

-   3 weeks total from the day you confirm. Plan the work yourself.

-   Once a week, send us a short progress update (5 lines: what works,
    what is blocked, what is next). Text is fine --- no formal report.

-   Everything else --- order of portals, anti-bot strategy, scheduling,
    your dev setup --- you decide. The whole thing runs on your machine;
    we don\'t touch your code or set anything up for you during the 3
    weeks. At the end, send us a link to your code (public Git repo or a
    zipped archive --- your call), a sample of the output/ directory
    from a real daily run, and a README that explains how to run it from
    cold start.

# How to respond

Within 48 hours of receiving this brief, reply to office@juhuu.app with
exactly one of:

-   \"I am in.\" --- we will reply with the öffentliche-Vergabe API spec
    and a short Day 0 confirmation; you can start whenever you\'re
    ready.

-   \"I am out.\" --- we will close your file with a polite thank-you.

**Looking forward to seeing what you build.**

*--- Team BOND*
