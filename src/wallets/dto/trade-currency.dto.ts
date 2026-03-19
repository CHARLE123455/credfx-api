import { SUPPORTED_CURRENCIES } from '@common/constants/currencies';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
} from 'class-validator';

export class TradeCurrencyDto {
  @ApiProperty({ example: 'NGN', description: 'Currency you are spending' })
  @IsString()
  @IsNotEmpty()
  @IsIn(SUPPORTED_CURRENCIES)
  sourceCurrency!: string;

  @ApiProperty({ example: 'USD', description: 'Currency you want to receive' })
  @IsString()
  @IsNotEmpty()
  @IsIn(SUPPORTED_CURRENCIES)
  targetCurrency!: string;

  @ApiProperty({
    example: 100,
    description: 'Exact amount of target currency you want to buy',
  })
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  targetAmount!: number;

  @ApiProperty({ description: 'Idempotency key', required: false })
  idempotencyKey?: string;
}
