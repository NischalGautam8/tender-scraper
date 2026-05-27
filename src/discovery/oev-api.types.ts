export interface DiscoveredTender {
  id: string;
  title: string;
  shortDescription?: string;
  estimatedValue?: { amount: number; currency: string } | null;
  documentsUrl: string;
  portalUrl: string;
  subPortalModule: string;
  rawResponse: any;
}
