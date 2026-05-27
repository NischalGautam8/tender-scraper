import { CreateProcurementInput } from './procurement.types';

export interface ValidationError {
  path: string;
  message: string;
  value: any;
}

export function validateNoPipelineFields(
  input: CreateProcurementInput,
): ValidationError[] {
  const errors: ValidationError[] = [];

  const checkObject = (obj: any, path: string) => {
    if (!obj || typeof obj !== 'object') return;

    // Check specific pipeline-owned paths
    if (path.endsWith('lotArray') && Array.isArray(obj)) {
      obj.forEach((lot: any, idx: number) => {
        if (lot && typeof lot === 'object') {
          if ('deliverableArray' in lot && lot.deliverableArray !== undefined && lot.deliverableArray !== null) {
            errors.push({
              path: `${path}[${idx}].deliverableArray`,
              message: 'Pipeline-owned field must not be populated',
              value: lot.deliverableArray,
            });
          }
          if ('requirementArray' in lot && lot.requirementArray !== undefined && lot.requirementArray !== null) {
            errors.push({
              path: `${path}[${idx}].requirementArray`,
              message: 'Pipeline-owned field must not be populated',
              value: lot.requirementArray,
            });
          }
          if (lot.location) {
            checkLocation(lot.location, `${path}[${idx}].location`);
          }
        }
      });
    }

    if (path.endsWith('location')) {
      checkLocation(obj, path);
    }

    if (path.endsWith('contractingBodyArray') && Array.isArray(obj)) {
      obj.forEach((body: any, idx: number) => {
        if (body && typeof body === 'object' && body.location) {
          checkLocation(body.location, `${path}[${idx}].location`);
        }
      });
    }

    if (path.endsWith('lotAwardArray') && Array.isArray(obj)) {
      obj.forEach((awardLot: any, idx: number) => {
        if (awardLot && typeof awardLot === 'object') {
          if ('winningCompanyIdArray' in awardLot && awardLot.winningCompanyIdArray !== undefined && awardLot.winningCompanyIdArray !== null) {
            errors.push({
              path: `${path}[${idx}].winningCompanyIdArray`,
              message: 'Pipeline-owned field must not be populated',
              value: awardLot.winningCompanyIdArray,
            });
          }
        }
      });
    }

    // Recurse into children
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val && typeof val === 'object') {
        checkObject(val, path ? `${path}.${key}` : key);
      }
    }
  };

  const checkLocation = (loc: any, path: string) => {
    if (!loc || typeof loc !== 'object') return;
    const forbidden = ['point', 'area', 'uberH3'];
    for (const f of forbidden) {
      if (f in loc && loc[f] !== undefined && loc[f] !== null) {
        errors.push({
          path: `${path}.${f}`,
          message: 'Pipeline-owned location field must not be populated',
          value: loc[f],
        });
      }
    }
  };

  checkObject(input, '');
  return errors;
}

export function validateLocale(
  input: CreateProcurementInput,
  expectedLocale: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  const checkLocaleObject = (obj: any, path: string) => {
    if (!obj || typeof obj !== 'object') return;

    // Detect if we are looking at one of our specified locale fields
    const localeFields = ['title', 'shortDescription', 'longDescription', 'openingDescription'];
    const parts = path.split('.');
    const fieldName = parts[parts.length - 1];

    if (localeFields.includes(fieldName)) {
      const keys = Object.keys(obj);
      for (const k of keys) {
        if (k !== expectedLocale && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
          errors.push({
            path: `${path}.${k}`,
            message: `LocaleObject must only contain the original language '${expectedLocale}', found '${k}'`,
            value: obj[k],
          });
        }
      }
    }
  };

  const traverse = (obj: any, path: string) => {
    if (!obj || typeof obj !== 'object') return;

    checkLocaleObject(obj, path);

    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val && typeof val === 'object') {
        traverse(val, path ? `${path}.${key}` : key);
      }
    }
  };

  traverse(input, '');
  return errors;
}

export function validateProcurement(
  input: CreateProcurementInput,
  expectedLocale: string,
): ValidationError[] {
  const pipelineErrors = validateNoPipelineFields(input);
  const localeErrors = validateLocale(input, expectedLocale);
  return [...pipelineErrors, ...localeErrors];
}
