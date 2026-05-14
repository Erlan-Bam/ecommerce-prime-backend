import { Global, Module } from '@nestjs/common';
import { AmoCrmService } from './amocrm.service';

@Global()
@Module({
  providers: [AmoCrmService],
  exports: [AmoCrmService],
})
export class AmoCrmModule {}
