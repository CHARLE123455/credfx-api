import { Controller, Get, Query, UseGuards, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { User } from '@users/entities/user.entity';

@ApiTags('Transactions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
    constructor(private readonly transactionsService: TransactionsService) { }

    @Get()
    @ApiOperation({ summary: 'View paginated transaction history with filters' })
    getUserTransactions(@CurrentUser() user: User, @Query() query: QueryTransactionsDto) {
        return this.transactionsService.getUserTransactions(user.id, query);
    }

    @Get(':reference')
    @ApiOperation({ summary: 'Get a single transaction by reference' })
    getTransaction(@CurrentUser() user: User, @Param('reference') reference: string) {
        return this.transactionsService.getTransactionByReference(user.id, reference);
    }
}