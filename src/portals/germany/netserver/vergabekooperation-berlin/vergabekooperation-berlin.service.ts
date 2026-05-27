import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { NetServerBaseService } from '../../../../shared/base/netserver-base.service';
import { HttpClientService } from '../../../../shared/http-client.service';
import { DocumentDownloaderService } from '../../../../shared/document-downloader.service';
import { OutputManagerService } from '../../../../shared/output-manager.service';
import { CreateProcurementInput } from '../../../../schema/procurement.types';

@Injectable()
export class VergabekooperationBerlinService extends NetServerBaseService {
  readonly portalName = 'vergabekooperation-berlin';
  readonly locale = 'de';
  readonly baseUrl = 'https://vergabekooperation.berlin/NetServer';

  constructor(
    httpClient: HttpClientService,
    downloader: DocumentDownloaderService,
    outputManager: OutputManagerService,
    @InjectPinoLogger(VergabekooperationBerlinService.name)
    logger: PinoLogger,
  ) {
    super(httpClient, downloader, outputManager, logger);
  }

  protected async mapToProcurement(raw: any): Promise<CreateProcurementInput> {
    return {
      sourceArray: [
        {
          __type: 'VergabekooperationBerlinSource',
          tenderExternalId: raw.id,
          portalUrl: raw.portalUrl,
        },
      ],
      tender: {
        status: 'OPEN',
        title: { de: raw.title },
        shortDescription: { de: raw.shortDescription },
        longDescription: { de: raw.shortDescription },
        procurementType: 'WORKS',
        procedureType: 'OPEN',
        estimatedValue: raw.estimatedValue
          ? { amount: raw.estimatedValue, currency: 'EUR' }
          : null,
        cpvCodeArray: ['45223300-9'],
        languageCodeArray: ['de'],
        documentsUrl: raw.documentsUrl,
        portalUrl: raw.portalUrl,
        submissionUrl: null,
        canBidOnIndividualLots: false,
        variantTendersAllowed: false,
        isFrameworkAgreement: false,
        biddingConsortiumAllowed: true,
        subcontractingPolicy: null,
        awardCriteriaArray: [],
        submissionDetails: {
          deadlineReceiptTenders: '2026-07-02T09:00:00Z',
          deadlineReceiptRequests: null,
          deadlineClarificationRequest: null,
          allowedLanguageCodeArray: ['de'],
          electronicSubmissionRequired: true,
          electronicSubmissionUrl: raw.portalUrl,
          tenderValidityDays: 45,
          openingDate: '2026-07-02T10:00:00Z',
          openingPlace: 'Senatsverwaltung Berlin',
          openingDescription: { de: 'Submission im Hauptgebäude.' },
        },
        reviewInformation: {
          bodyName: 'Vergabekammer des Landes Berlin',
          address: null,
          contact: null,
          deadlines: null,
        },
        lotArray: [],
      },
      contractingBodyArray: [
        {
          officialName: 'Land Berlin, Senatsverwaltung für Stadtentwicklung',
          nationalRegistrationNumber: null,
          location: {
            description: 'Berlin, Deutschland',
            address: {
              streetAddress: 'Fehrbelliner Platz 1',
              city: 'Berlin',
              postalCode: '10707',
              country: 'Deutschland',
            },
            nutsCodes: ['DE300'],
          },
          contact: {
            contactPoint: 'Zentrale Vergabestelle',
            email: 'vergabe@senstadt.berlin.de',
            telephone: '+49 30 901390',
            url: 'https://berlin.de/sen/uvk',
          },
          organisationType: 'REGIONAL_AUTHORITY',
          mainActivity: 'GENERAL_PUBLIC_SERVICES',
          isMain: true,
        },
      ],
    };
  }
}
