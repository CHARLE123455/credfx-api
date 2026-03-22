import { SUPPORTED_CURRENCIES } from '@common/constants/currencies';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class ConvertCurrencyDto {
  @ApiProperty({ example: 'NGN' })
  @IsString()
  @IsNotEmpty()
  @IsIn(SUPPORTED_CURRENCIES, { message: 'Unsupported source currency' })
  fromCurrency!: string;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  @IsIn(SUPPORTED_CURRENCIES, { message: 'Unsupported target currency' })
  toCurrency!: string;

  @ApiProperty({
    example: 1000,
    description: 'Amount in source currency to convert',
  })
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  amount!: number;

  @ApiProperty({ description: 'Idempotency key', required: false })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
