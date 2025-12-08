import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);
  private isTechWork = false;
  private isWebsiteTechWork = false;

  getMaintenanceStatus(): boolean {
    return this.isTechWork;
  }

  setMaintenanceMode(status: boolean): void {
    this.isTechWork = status;
    this.logger.log(`Maintenance mode ${status ? 'enabled' : 'disabled'}`);
  }

  enableMaintenance(): void {
    this.setMaintenanceMode(true);
  }

  disableMaintenance(): void {
    this.setMaintenanceMode(false);
  }

  getWebsiteTechWorkStatus(): boolean {
    return this.isWebsiteTechWork;
  }

  setWebsiteTechWorkMode(status: boolean): void {
    this.isWebsiteTechWork = status;
    this.logger.log(
      `Website tech work mode ${status ? 'enabled' : 'disabled'}`,
    );
  }

  enableWebsiteTechWork(): void {
    this.setWebsiteTechWorkMode(true);
  }

  disableWebsiteTechWork(): void {
    this.setWebsiteTechWorkMode(false);
  }
}
