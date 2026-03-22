import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '@users/users.service';
import { TransactionsService } from '@transactions/transactions.service';
import { FxRateSnapshot } from '@fx/entities/fx-rate-snapshot.entity';
import { Transaction } from '@transactions/entities/transaction.entity';
import { User } from '@users/entities/user.entity';
import { Role } from '@users/enums/role.enum';
import { QueryTransactionsDto } from '@transactions/dto/query-transactions.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly usersService: UsersService,
    private readonly transactionsService: TransactionsService,
    @InjectRepository(FxRateSnapshot)
    private readonly snapshotRepository: Repository<FxRateSnapshot>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getAllUsers(page = 1, limit = 20) {
    return this.usersService.findAll(page, limit);
  }

  async getUserById(id: string): Promise<User> {
    return this.usersService.findById(id);
  }

  async updateUserRole(id: string, role: Role): Promise<{ message: string }> {
    await this.usersService.update(id, { role });
    return { message: `User role updated to ${role}` };
  }

  async getAllTransactions(query: QueryTransactionsDto) {
    return this.transactionsService.getAllTransactions(query);
  }

  async getAnalyticsSummary() {
    const totalUsers = await this.userRepository.count();
    const verifiedUsers = await this.userRepository.count({
      where: { isVerified: true },
    });

    const volumeByType = await this.transactionRepository
      .createQueryBuilder('tx')
      .select('tx.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(tx.amount)', 'volume')
      .groupBy('tx.type')
      .getRawMany();

    const volumeByCurrency = await this.transactionRepository
      .createQueryBuilder('tx')
      .select('tx.fromCurrency', 'currency')
      .addSelect('SUM(tx.amount)', 'volume')
      .addSelect('COUNT(*)', 'count')
      .groupBy('tx.fromCurrency')
      .getRawMany();

    const topUsers = await this.transactionRepository
      .createQueryBuilder('tx')
      .select('tx.userId', 'userId')
      .addSelect('COUNT(*)', 'transactionCount')
      .addSelect('COALESCE(SUM(tx.amount), 0)', 'totalVolume')
      .leftJoin('tx.user', 'user')
      .addSelect('user.email', 'email')
      .addSelect('user.firstName', 'firstName')
      .addSelect('user.lastName', 'lastName')
      .groupBy('tx.userId')
      .addGroupBy('user.email')
      .addGroupBy('user.firstName')
      .addGroupBy('user.lastName')
      .orderBy('COUNT(*)', 'DESC')
      .limit(10)
      .getRawMany<{
        userId: string;
        transactionCount: string;
        totalVolume: string;
        email: string;
        firstName: string;
        lastName: string;
      }>();

    return {
      users: {
        total: totalUsers,
        verified: verifiedUsers,
        unverified: totalUsers - verifiedUsers,
      },
      transactions: { byType: volumeByType, byCurrency: volumeByCurrency },
      topUsers,
    };
  }

  async getFxTrends(baseCurrency = 'NGN', limit = 20) {
    return this.snapshotRepository.find({
      where: { baseCurrency },
      order: { fetchedAt: 'DESC' },
      take: limit,
    });
  }
}
