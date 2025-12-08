import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);
  private isTechWork = false;

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
}
