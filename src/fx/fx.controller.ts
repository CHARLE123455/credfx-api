import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FxService } from './fx.service';
import { GetRatesDto } from './dto/get-rates.dto';
import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';

@ApiTags('FX Rates')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('fx')
export class FxController {
  constructor(private readonly fxService: FxService) {}

  @Get('rates')
  @ApiOperation({
    summary: 'Get real-time FX rates for supported currency pairs',
  })
  getRates(@Query() dto: GetRatesDto) {
    return this.fxService.getRates(dto.base);
  }

  @Get('pairs')
  @ApiOperation({ summary: 'Get all supported trading pairs' })
  getPairs() {
    return this.fxService.getSupportedPairs();
  }
}
