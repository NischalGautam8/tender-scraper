import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as fs from 'fs';
import * as path from 'path';
import { TypedConfigService } from '../config/typed-config.service';
import { CreateProcurementInput } from '../schema/procurement.types';

@Injectable()
export class OutputManagerService {
  constructor(
    private readonly config: TypedConfigService,
    @InjectPinoLogger(OutputManagerService.name)
    private readonly logger: PinoLogger,
  ) {}

  private getPortalDir(portal: string): string {
    return path.join(this.config.outputDir, portal);
  }

  private getTenderDir(portal: string, tenderId: string): string {
    return path.join(this.getPortalDir(portal), tenderId);
  }

  async ensureTenderDir(portal: string, tenderId: string): Promise<string> {
    const dir = this.getTenderDir(portal, tenderId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  async ensureDocumentsDir(portal: string, tenderId: string): Promise<string> {
    const dir = path.join(this.getTenderDir(portal, tenderId), 'documents');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  async writeProcurement(
    portal: string,
    tenderId: string,
    data: CreateProcurementInput,
  ): Promise<void> {
    const tenderDir = await this.ensureTenderDir(portal, tenderId);
    const destPath = path.join(tenderDir, 'procurement.json');
    const tempPath = `${destPath}.tmp`;

    try {
      this.logger.debug({ destPath }, 'Writing procurement.json atomically');
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tempPath, destPath);
    } catch (error: any) {
      this.logger.error({ destPath, error: error.message }, 'Failed to write procurement.json atomically');
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch {}
      }
      throw error;
    }
  }

  async hasProcurement(portal: string, tenderId: string): Promise<boolean> {
    const filePath = path.join(this.getTenderDir(portal, tenderId), 'procurement.json');
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  }

  async listTenderIds(portal: string): Promise<string[]> {
    const portalDir = this.getPortalDir(portal);
    if (!fs.existsSync(portalDir)) {
      return [];
    }

    try {
      const entries = fs.readdirSync(portalDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch (error: any) {
      this.logger.error({ portalDir, error: error.message }, 'Failed to list tender IDs');
      return [];
    }
  }

  async readProcurement(
    portal: string,
    tenderId: string,
  ): Promise<CreateProcurementInput | null> {
    const filePath = path.join(this.getTenderDir(portal, tenderId), 'procurement.json');
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content) as CreateProcurementInput;
    } catch (error: any) {
      this.logger.error({ filePath, error: error.message }, 'Failed to read procurement.json');
      return null;
    }
  }

  async countDocuments(portal: string, tenderId: string): Promise<number> {
    const docsDir = path.join(this.getTenderDir(portal, tenderId), 'documents');
    if (!fs.existsSync(docsDir)) {
      return 0;
    }

    try {
      const files = fs.readdirSync(docsDir);
      return files.length;
    } catch (error: any) {
      this.logger.error({ docsDir, error: error.message }, 'Failed to count documents');
      return 0;
    }
  }
}
