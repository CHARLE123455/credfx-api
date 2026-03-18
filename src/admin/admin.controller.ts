import { Controller, Get, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
import { RolesGuard } from '@auth/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { Role } from '@users/enums/role.enum';
import { QueryTransactionsDto } from '@transactions/dto/query-transactions.dto';
import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class UpdateRoleDto {
    @ApiProperty({ enum: Role })
    @IsIn(Object.values(Role))
    role: Role;
}

@ApiTags('Admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    @Get('users')
    @ApiOperation({ summary: '[Admin] List all users with pagination' })
    getAllUsers(@Query('page') page: number, @Query('limit') limit: number) {
        return this.adminService.getAllUsers(page, limit);
    }

    @Get('users/:id')
    @ApiOperation({ summary: '[Admin] Get user by ID' })
    getUserById(@Param('id') id: string) {
        return this.adminService.getUserById(id);
    }

    @Patch('users/:id/role')
    @ApiOperation({ summary: '[Admin] Update user role' })
    updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
        return this.adminService.updateUserRole(id, dto.role);
    }

    @Get('transactions')
    @ApiOperation({ summary: '[Admin] View all transactions' })
    getAllTransactions(@Query() query: QueryTransactionsDto) {
        return this.adminService.getAllTransactions(query);
    }

    @Get('analytics/summary')
    @ApiOperation({ summary: '[Admin] Get platform analytics summary' })
    getSummary() {
        return this.adminService.getAnalyticsSummary();
    }

    @Get('analytics/fx-trends')
    @ApiOperation({ summary: '[Admin] Get FX rate history for trend analysis' })
    getFxTrends(@Query('base') base: string, @Query('limit') limit: number) {
        return this.adminService.getFxTrends(base, limit);
    }
}