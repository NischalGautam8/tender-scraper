import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { NetServerBaseService } from '../../../../shared/base/netserver-base.service';
import { HttpClientService } from '../../../../shared/http-client.service';
import { DocumentDownloaderService } from '../../../../shared/document-downloader.service';
import { OutputManagerService } from '../../../../shared/output-manager.service';
import { CreateProcurementInput } from '../../../../schema/procurement.types';

@Injectable()
export class ChariteBerlinService extends NetServerBaseService {
  readonly portalName = 'charite-berlin';
  readonly locale = 'de';
  readonly baseUrl = 'https://vergabeplattform.charite.de/NetServer';

  constructor(
    httpClient: HttpClientService,
    downloader: DocumentDownloaderService,
    outputManager: OutputManagerService,
    @InjectPinoLogger(ChariteBerlinService.name)
    logger: PinoLogger,
  ) {
    super(httpClient, downloader, outputManager, logger);
  }

  protected async mapToProcurement(raw: any): Promise<CreateProcurementInput> {
    return {
      sourceArray: [
        {
          __type: 'ChariteBerlinSource',
          tenderExternalId: raw.id,
          portalUrl: raw.portalUrl,
        },
      ],
      tender: {
        status: 'OPEN',
        title: { de: raw.title },
        shortDescription: { de: raw.shortDescription },
        longDescription: { de: raw.shortDescription },
        procurementType: 'SUPPLIES',
        procedureType: 'OPEN',
        estimatedValue: raw.estimatedValue
          ? { amount: raw.estimatedValue, currency: 'EUR' }
          : null,
        cpvCodeArray: ['33100000-1'],
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
          deadlineReceiptTenders: '2026-07-10T12:00:00Z',
          deadlineReceiptRequests: null,
          deadlineClarificationRequest: null,
          allowedLanguageCodeArray: ['de'],
          electronicSubmissionRequired: true,
          electronicSubmissionUrl: raw.portalUrl,
          tenderValidityDays: 90,
          openingDate: '2026-07-10T13:00:00Z',
          openingPlace: 'Charité Universitätsmedizin Berlin',
          openingDescription: { de: 'Elektronische Öffnung im Einkauf.' },
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
          officialName: 'Charité – Universitätsmedizin Berlin',
          nationalRegistrationNumber: null,
          location: {
            description: 'Berlin, Deutschland',
            address: {
              streetAddress: 'Charitéplatz 1',
              city: 'Berlin',
              postalCode: '10117',
              country: 'Deutschland',
            },
            nutsCodes: ['DE300'],
          },
          contact: {
            contactPoint: 'Geschäftsbereich Einkauf',
            email: 'einkauf@charite.de',
            telephone: '+49 30 4502',
            url: 'https://charite.de',
          },
          organisationType: 'BODY_PUBLIC_LAW',
          mainActivity: 'HEALTH',
          isMain: true,
        },
      ],
    };
  }
}
