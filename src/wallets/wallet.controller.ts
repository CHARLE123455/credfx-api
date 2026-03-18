import { Controller, Get, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { FundWalletDto } from './dto/fund-wallet.dto';
import { ConvertCurrencyDto } from './dto/convert-currency.dto';
import { TradeCurrencyDto } from './dto/trade-currency.dto';
import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { User } from '@users/entities/user.entity';

@ApiTags('Wallet')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
    constructor(private readonly walletService: WalletService) { }

    @Get()
    @ApiOperation({ summary: 'Get user wallet balances across all currencies' })
    getWallet(@CurrentUser() user: User) {
        return this.walletService.getWallet(user.id);
    }

    @Post('fund')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Fund wallet in NGN or any supported currency' })
    @ApiHeader({ name: 'X-Idempotency-Key', description: 'Optional idempotency key', required: false })
    fundWallet(@CurrentUser() user: User, @Body() dto: FundWalletDto) {
        return this.walletService.fundWallet(user.id, dto);
    }

    @Post('convert')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Convert exact source amount to target currency (no fee)' })
    convertCurrency(@CurrentUser() user: User, @Body() dto: ConvertCurrencyDto) {
        return this.walletService.convertCurrency(user.id, dto);
    }

    @Post('trade')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Buy exact target currency amount (0.5% trading fee applied)' })
    tradeCurrency(@CurrentUser() user: User, @Body() dto: TradeCurrencyDto) {
        return this.walletService.tradeCurrency(user.id, dto);
    }
}