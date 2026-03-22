import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsPositive,
  IsOptional,
  IsIn,
  IsString,
} from 'class-validator';
import { SUPPORTED_CURRENCIES } from '@common/constants/currencies';

export class FundWalletDto {
  @ApiProperty({
    example: 50000,
    description: 'Amount to fund (in the specified currency)',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({
    example: 'NGN',
    description: 'Currency to fund (defaults to NGN)',
  })
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES, { message: 'Unsupported currency' })
  currency?: string = 'NGN';

  @ApiPropertyOptional({
    description: 'Idempotency key to prevent duplicate funding',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
