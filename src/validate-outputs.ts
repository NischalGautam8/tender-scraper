import * as fs from 'fs';
import * as path from 'path';
import { validateProcurement } from './schema/validation';

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

const portalLocales: Record<string, string> = {
  'udbud-dk': 'da',
  'placsp-es': 'es',
  'bi-medien': 'de',
  'evergabe-de': 'de',
  'fbhh-hamburg': 'de',
  'hamburg-wasser': 'de',
  'vergabekooperation-berlin': 'de',
  'sachsen-evergabe': 'de',
  'charite-berlin': 'de',
  'dtvp': 'de',
  'deutsche-evergabe': 'de',
};

async function runValidation() {
  console.log('==================================================');
  console.log('🔍 Running EU Scraper Output & Schema Audit');
  console.log('==================================================\n');

  if (!fs.existsSync(OUTPUT_DIR)) {
    console.error(`❌ Output directory does not exist: ${OUTPUT_DIR}`);
    process.exit(1);
  }

  const portals = fs.readdirSync(OUTPUT_DIR).filter((f) => {
    return fs.statSync(path.join(OUTPUT_DIR, f)).isDirectory();
  });

  let totalTenders = 0;
  let totalValid = 0;
  let totalInvalid = 0;
  let totalDocsDownloaded = 0;

  const portalReports: any[] = [];

  for (const portal of portals) {
    const portalPath = path.join(OUTPUT_DIR, portal);
    const expectedLocale = portalLocales[portal] || 'de';

    const tenderIds = fs.readdirSync(portalPath).filter((f) => {
      return fs.statSync(path.join(portalPath, f)).isDirectory();
    });

    let tendersFound = 0;
    let documentsDownloaded = 0;
    let schemaErrorsCount = 0;
    const errorsList: string[] = [];

    for (const tenderId of tenderIds) {
      tendersFound++;
      totalTenders++;

      const tenderPath = path.join(portalPath, tenderId);
      const procurementJsonPath = path.join(tenderPath, 'procurement.json');
      const docsPath = path.join(tenderPath, 'documents');

      // 1. Check procurement.json presence
      if (!fs.existsSync(procurementJsonPath)) {
        schemaErrorsCount++;
        errorsList.push(`[${tenderId}] Missing procurement.json`);
        continue;
      }

      // 2. Schema validation
      try {
        const raw = fs.readFileSync(procurementJsonPath, 'utf8');
        const parsed = JSON.parse(raw);
        const errors = validateProcurement(parsed, expectedLocale);

        if (errors.length > 0) {
          schemaErrorsCount++;
          errorsList.push(
            `[${tenderId}] Schema Validation Errors:\n` +
              errors.map((e) => `  - ${e.path}: ${e.message} (value: ${JSON.stringify(e.value)})`).join('\n')
          );
        }

        // Check required documentsUrl
        if (!parsed.tender?.documentsUrl) {
          schemaErrorsCount++;
          errorsList.push(`[${tenderId}] Missing REQUIRED field: tender.documentsUrl`);
        }
      } catch (err: any) {
        schemaErrorsCount++;
        errorsList.push(`[${tenderId}] Failed to parse JSON: ${err.message}`);
      }

      // 3. Document download check
      if (fs.existsSync(docsPath) && fs.statSync(docsPath).isDirectory()) {
        const files = fs.readdirSync(docsPath);
        if (files.length > 0) {
          documentsDownloaded++;
          totalDocsDownloaded++;
        } else {
          schemaErrorsCount++;
          errorsList.push(`[${tenderId}] documents/ folder exists but is empty`);
        }
      } else {
        schemaErrorsCount++;
        errorsList.push(`[${tenderId}] Missing documents/ folder`);
      }
    }

    const isValid = schemaErrorsCount === 0;
    if (isValid) {
      totalValid += tendersFound;
    } else {
      totalInvalid += tendersFound;
    }

    portalReports.push({
      portal,
      tendersFound,
      documentsDownloaded,
      schemaErrorsCount,
      errorsList,
    });
  }

  // Print Report Card
  console.log('📊 Portal Audit Reports:');
  console.log('--------------------------------------------------');
  for (const report of portalReports) {
    const status = report.schemaErrorsCount === 0 ? '🟢 PASS' : '🔴 FAIL';
    console.log(`${status} | Portal: ${report.portal.padEnd(28)} | Tenders: ${report.tendersFound.toString().padEnd(3)} | Docs: ${report.documentsDownloaded.toString().padEnd(3)}`);
    if (report.errorsList.length > 0) {
      console.log('   ⚠️  Details:');
      for (const err of report.errorsList.slice(0, 3)) {
        console.log(`     ${err}`);
      }
      if (report.errorsList.length > 3) {
        console.log(`     ... and ${report.errorsList.length - 3} more errors.`);
      }
    }
  }

  console.log('\n==================================================');
  console.log('📈 Summary Metrics:');
  console.log('==================================================');
  console.log(`Total Tenders Checked:      ${totalTenders}`);
  console.log(`Total Fully Valid Tenders:  ${totalTenders - totalInvalid}`);
  console.log(`Total Invalid/Faulty:       ${totalInvalid}`);
  console.log(`Total Documents Downloaded: ${totalDocsDownloaded}`);
  console.log(`Global Documents coverage:  ${((totalDocsDownloaded / totalTenders) * 100).toFixed(1)}%`);
  console.log('==================================================\n');

  if (totalInvalid > 0) {
    console.error('❌ Audit Failed: One or more tenders have schema errors or missing files.');
    process.exit(1);
  } else {
    console.log('✅ Audit Passed: All output files are fully schema-compliant and contain documents.');
    process.exit(0);
  }
}

runValidation().catch((err) => {
  console.error('Fatal error during validation script run:', err);
  process.exit(1);
});
