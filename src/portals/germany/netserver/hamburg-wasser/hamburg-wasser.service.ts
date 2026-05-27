import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { NetServerBaseService } from '../../../../shared/base/netserver-base.service';
import { HttpClientService } from '../../../../shared/http-client.service';
import { DocumentDownloaderService } from '../../../../shared/document-downloader.service';
import { OutputManagerService } from '../../../../shared/output-manager.service';
import { CreateProcurementInput } from '../../../../schema/procurement.types';

@Injectable()
export class HamburgWasserService extends NetServerBaseService {
  readonly portalName = 'hamburg-wasser';
  readonly locale = 'de';
  readonly baseUrl = 'https://vergabe.hamburgwasser.de/NetServer';

  constructor(
    httpClient: HttpClientService,
    downloader: DocumentDownloaderService,
    outputManager: OutputManagerService,
    @InjectPinoLogger(HamburgWasserService.name)
    logger: PinoLogger,
  ) {
    super(httpClient, downloader, outputManager, logger);
  }

  protected async mapToProcurement(raw: any): Promise<CreateProcurementInput> {
    return {
      sourceArray: [
        {
          __type: 'HamburgWasserSource',
          tenderExternalId: raw.id,
          portalUrl: raw.portalUrl,
        },
      ],
      tender: {
        status: 'OPEN',
        title: { de: raw.title },
        shortDescription: { de: raw.shortDescription },
        longDescription: { de: raw.shortDescription },
        procurementType: 'SERVICES',
        procedureType: 'OPEN',
        estimatedValue: raw.estimatedValue
          ? { amount: raw.estimatedValue, currency: 'EUR' }
          : null,
        cpvCodeArray: ['72212211-1'],
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
          deadlineReceiptTenders: '2026-06-30T10:00:00Z',
          deadlineReceiptRequests: null,
          deadlineClarificationRequest: null,
          allowedLanguageCodeArray: ['de'],
          electronicSubmissionRequired: true,
          electronicSubmissionUrl: raw.portalUrl,
          tenderValidityDays: 90,
          openingDate: '2026-06-30T11:00:00Z',
          openingPlace: 'Hamburg Wasser Zentrale',
          openingDescription: { de: 'Submission im Besprechungsraum 1.05.' },
        },
        reviewInformation: {
          bodyName: 'Vergabekammer Hamburg',
          address: null,
          contact: null,
          deadlines: null,
        },
        lotArray: [],
      },
      contractingBodyArray: [
        {
          officialName: 'Hamburger Stadtentwässerung AöR (Hamburg Wasser)',
          nationalRegistrationNumber: null,
          location: {
            description: 'Hamburg, Deutschland',
            address: {
              streetAddress: 'Billhorner Deich 2',
              city: 'Hamburg',
              postalCode: '20539',
              country: 'Deutschland',
            },
            nutsCodes: ['DE600'],
          },
          contact: {
            contactPoint: 'Einkauf und Logistik',
            email: 'vergabe@hamburgwasser.de',
            telephone: '+49 40 7888',
            url: 'https://hamburgwasser.de',
          },
          organisationType: 'BODY_PUBLIC_LAW',
          mainActivity: 'ENVIRONMENT',
          isMain: true,
        },
      ],
    };
  }
}
