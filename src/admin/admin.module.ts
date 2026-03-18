import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UsersModule } from '@users/users.module';
import { TransactionsModule } from '@transactions/transactions.module';
import { FxRateSnapshot } from '@fx/entities/fx-rate-snapshot.entity';
import { Transaction } from '@transactions/entities/transaction.entity';
import { User } from '@users/entities/user.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([FxRateSnapshot, Transaction, User]),
        UsersModule,
        TransactionsModule,
    ],
    providers: [AdminService],
    controllers: [AdminController],
})
export class AdminModule { }