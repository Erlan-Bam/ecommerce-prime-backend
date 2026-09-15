import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { SharedModule } from '../shared/shared.module';
import { AiDescriptionsController } from './ai-descriptions.controller';
import { AiDescriptionsService } from './ai-descriptions.service';
import { AiDescriptionsProcessor } from './ai-descriptions.processor';

@Module({
  imports: [
    SharedModule,
    BullModule.registerQueue({ name: 'ai-descriptions' }),
  ],
  controllers: [AiDescriptionsController],
  providers: [AiDescriptionsService, AiDescriptionsProcessor],
  exports: [AiDescriptionsService],
})
export class AiDescriptionsModule {}
