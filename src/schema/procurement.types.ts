import { PortalSource } from './source.types';

/**
 * Locale-keyed string map. ONLY fill the original language.
 * e.g. { de: "Bauauftrag" } for German portals.
 * Translation to other locales happens in the pipeline later.
 */
export type LocaleObject = Partial<Record<string, string>>;

export interface CreateProcurementInput {
  sourceArray: PortalSource[];

  tender: {
    status: TenderStatus;
    title: LocaleObject;
    shortDescription: LocaleObject;
    longDescription: LocaleObject;
    procurementType: string;
    procedureType: string;
    estimatedValue: MoneyValue | null;
    cpvCodeArray: string[];
    languageCodeArray: string[];
    documentsUrl: string;               // REQUIRED — document cron reads this
    portalUrl: string;                   // Human-readable notice page
    submissionUrl: string | null;
    canBidOnIndividualLots: boolean | null;
    variantTendersAllowed: boolean | null;
    isFrameworkAgreement: boolean | null;
    biddingConsortiumAllowed: boolean | null;
    subcontractingPolicy: string | null;
    awardCriteriaArray: AwardCriterion[];
    submissionDetails: SubmissionDetails;
    reviewInformation: ReviewInformation;
    lotArray: Lot[];
  };

  contractingBodyArray: ContractingBody[];

  award?: AwardInfo;
}

export type TenderStatus = 'OPEN' | 'AWARDED' | 'CANCELLED' | 'CLOSED' | 'PLANNED';

export interface MoneyValue {
  amount: number;
  currency: string; // ISO 4217 (EUR, DKK, etc.)
}

export interface SubmissionDetails {
  deadlineReceiptTenders: string | null;       // ISO-8601
  deadlineReceiptRequests: string | null;      // ISO-8601 ← Interessenten deadline
  deadlineClarificationRequest: string | null; // ISO-8601
  allowedLanguageCodeArray: string[];
  electronicSubmissionRequired: boolean | null;
  electronicSubmissionUrl: string | null;
  tenderValidityDays: number | null;
  openingDate: string | null;                  // ISO-8601
  openingPlace: string | null;
  openingDescription: LocaleObject | null;
}

export interface Lot {
  label: string;
  number: string;
  title: LocaleObject;
  shortDescription: LocaleObject;
  longDescription: LocaleObject;
  duration: {
    startDate: string | null;   // ISO-8601
    endDate: string | null;     // ISO-8601
  };
  location: LocationInfo;
  estimatedValue: MoneyValue | null;
  cpvCodeArray: string[];
  submissionDetails: SubmissionDetails;
}

export interface LocationInfo {
  description: string | null;
  address: AddressInfo | null;
  nutsCodes: string[];
  // NO point, area, or uberH3 — pipeline-owned
}

export interface AddressInfo {
  streetAddress: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface ContractingBody {
  officialName: string;
  nationalRegistrationNumber: string | null;
  location: LocationInfo;
  contact: ContactInfo;
  organisationType: string | null;
  mainActivity: string | null;
  isMain: boolean;
}

export interface ContactInfo {
  contactPoint: string | null;
  email: string | null;
  telephone: string | null;
  url: string | null;
}

export interface AwardCriterion {
  type: string;
  name: string | null;
  weight: number | null;
}

export interface ReviewInformation {
  bodyName: string | null;
  address: AddressInfo | null;
  contact: ContactInfo | null;
  deadlines: string | null;
}

export interface AwardInfo {
  totalValue: MoneyValue | null;
  lotAwardArray: LotAward[];
}

export interface LotAward {
  label: string;
  title: LocaleObject;
  totalValue: MoneyValue | null;
  awardDate: string | null;
  tendersReceived: number | null;
  // NO winningCompanyIdArray — pipeline-owned
}
