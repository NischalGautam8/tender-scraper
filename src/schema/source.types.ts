export type PortalSource =
  | DtvpSource
  | DeutscheEvergabeSource
  | EvergabeDeSource
  | BiMedienSource
  | HamburgWasserSource
  | FbhhHamburgSource
  | ChariteBerlinSource
  | VergabekooperationBerlinSource
  | SachsenEvergabeSource
  | UdbudDkSource
  | PlacspSource;

export interface DtvpSource {
  __type: 'DtvpSource';
  tenderExternalId: string;
  portalUrl: string;
}

export interface DeutscheEvergabeSource {
  __type: 'DeutscheEvergabeSource';
  tenderExternalId: string;
  portalUrl: string;
}

export interface EvergabeDeSource {
  __type: 'EvergabeDeSource';
  tenderExternalId: string;
  portalUrl: string;
}

export interface BiMedienSource {
  __type: 'BiMedienSource';
  tenderExternalId: string;
  portalUrl: string;
}

export interface HamburgWasserSource {
  __type: 'HamburgWasserSource';
  tenderExternalId: string;
  portalUrl: string;
}

export interface FbhhHamburgSource {
  __type: 'FbhhHamburgSource';
  tenderExternalId: string;
  portalUrl: string;
}

export interface ChariteBerlinSource {
  __type: 'ChariteBerlinSource';
  tenderExternalId: string;
  portalUrl: string;
}

export interface VergabekooperationBerlinSource {
  __type: 'VergabekooperationBerlinSource';
  tenderExternalId: string;
  portalUrl: string;
}

export interface SachsenEvergabeSource {
  __type: 'SachsenEvergabeSource';
  tenderExternalId: string;
  portalUrl: string;
}

export interface UdbudDkSource {
  __type: 'UdbudDkSource';
  noticeId: string;
  portalUrl: string;
}

export interface PlacspSource {
  __type: 'PlacspSource';
  expedienteId: string;
  licitacionId: string;
  portalUrl: string;
}
