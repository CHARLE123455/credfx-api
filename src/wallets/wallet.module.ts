import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletBalance } from './entities/wallet-balance.entity';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { FxModule } from '@fx/fx.module';
import { Transaction } from '@transactions/entities/transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, WalletBalance, Transaction]),
    FxModule,
  ],
  providers: [WalletService],
  controllers: [WalletController],
  exports: [WalletService],
})
export class WalletModule {}
