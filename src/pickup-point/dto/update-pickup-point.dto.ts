import { PartialType } from '@nestjs/swagger';
import { CreatePickupPointDto } from './create-pickup-point.dto';

export class UpdatePickupPointDto extends PartialType(CreatePickupPointDto) {}
