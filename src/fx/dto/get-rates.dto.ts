import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsIn } from 'class-validator';
import { SUPPORTED_CURRENCIES } from '@common/constants/currencies';

export class GetRatesDto {
    @ApiPropertyOptional({ example: 'NGN', description: 'Base currency for rates' })
    @IsOptional()
    @IsIn(SUPPORTED_CURRENCIES)
    base?: string = 'NGN';
}