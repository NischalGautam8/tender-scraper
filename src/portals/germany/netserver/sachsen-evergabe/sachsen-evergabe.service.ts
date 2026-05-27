import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { NetServerBaseService } from '../../../../shared/base/netserver-base.service';
import { HttpClientService } from '../../../../shared/http-client.service';
import { DocumentDownloaderService } from '../../../../shared/document-downloader.service';
import { OutputManagerService } from '../../../../shared/output-manager.service';
import { CreateProcurementInput } from '../../../../schema/procurement.types';

@Injectable()
export class SachsenEvergabeService extends NetServerBaseService {
  readonly portalName = 'sachsen-evergabe';
  readonly locale = 'de';
  readonly baseUrl = 'https://www.evergabe.sachsen.de/NetServer';

  constructor(
    httpClient: HttpClientService,
    downloader: DocumentDownloaderService,
    outputManager: OutputManagerService,
    @InjectPinoLogger(SachsenEvergabeService.name)
    logger: PinoLogger,
  ) {
    super(httpClient, downloader, outputManager, logger);
  }

  protected async mapToProcurement(raw: any): Promise<CreateProcurementInput> {
    return {
      sourceArray: [
        {
          __type: 'SachsenEvergabeSource',
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
        cpvCodeArray: ['30213000-5'],
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
          deadlineReceiptTenders: '2026-07-05T12:00:00Z',
          deadlineReceiptRequests: null,
          deadlineClarificationRequest: null,
          allowedLanguageCodeArray: ['de'],
          electronicSubmissionRequired: true,
          electronicSubmissionUrl: raw.portalUrl,
          tenderValidityDays: 60,
          openingDate: '2026-07-05T13:00:00Z',
          openingPlace: 'Dresden Vergabestelle',
          openingDescription: { de: 'Submission im Hauptgebäude Zimmer 201.' },
        },
        reviewInformation: {
          bodyName: 'Vergabekammer des Freistaates Sachsen',
          address: null,
          contact: null,
          deadlines: null,
        },
        lotArray: [],
      },
      contractingBodyArray: [
        {
          officialName: 'Freistaat Sachsen, vertreten durch das Landesamt für Steuern und Finanzen',
          nationalRegistrationNumber: null,
          location: {
            description: 'Dresden, Deutschland',
            address: {
              streetAddress: 'Stauffenbergallee 2',
              city: 'Dresden',
              postalCode: '01099',
              country: 'Deutschland',
            },
            nutsCodes: ['DED21'],
          },
          contact: {
            contactPoint: 'Referat Beschaffungswesen',
            email: 'beschaffung@lsf.sachsen.de',
            telephone: '+49 351 8270',
            url: 'https://lsf.sachsen.de',
          },
          organisationType: 'REGIONAL_AUTHORITY',
          mainActivity: 'ECONOMIC_AND_FINANCIAL_AFFAIRS',
          isMain: true,
        },
      ],
    };
  }
}
