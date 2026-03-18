import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '@users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailService } from '@mail/mail.service';
import { DataSource, QueryRunner } from 'typeorm';
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
        create: jest.fn(),
        save: jest.fn(),
        findOne: jest.fn(),
    },
} as unknown as QueryRunner;

const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
} as unknown as DataSource;

const mockUsersService = {
    create: jest.fn(),
    findByEmail: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
};

const mockJwtService = { sign: jest.fn().mockReturnValue('mock_jwt_token') };
const mockConfigService = { get: jest.fn().mockReturnValue(1000) };
const mockMailService = { sendOtp: jest.fn().mockResolvedValue(undefined) };

describe('AuthService', () => {
    let service: AuthService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: UsersService, useValue: mockUsersService },
                { provide: JwtService, useValue: mockJwtService },
                { provide: ConfigService, useValue: mockConfigService },
                { provide: MailService, useValue: mockMailService },
                { provide: DataSource, useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);
        jest.clearAllMocks();
        mockDataSource.createQueryRunner = jest.fn().mockReturnValue(mockQueryRunner);
    });

    describe('register', () => {
        it('creates a user, wallet, and sends OTP email', async () => {
            const savedUser = { id: 'user-uuid', email: 'test@test.com', firstName: 'Test' };
            const savedWallet = { id: 'wallet-uuid' };

            (mockQueryRunner.manager.create as jest.Mock)
                .mockReturnValueOnce(savedUser)
                .mockReturnValueOnce(savedWallet)
                .mockReturnValueOnce({});
            (mockQueryRunner.manager.save as jest.Mock)
                .mockResolvedValueOnce(savedUser)
                .mockResolvedValueOnce(savedWallet)
                .mockResolvedValueOnce({});

            const result = await service.register({
                email: 'test@test.com',
                password: 'Test1234!',
                firstName: 'Test',
                lastName: 'User',
            });

            expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
            expect(mockMailService.sendOtp).toHaveBeenCalledWith('test@test.com', 'Test', expect.any(String));
            expect(result.message).toContain('OTP has been sent');
        });

        it('rolls back transaction on error', async () => {
            (mockQueryRunner.manager.save as jest.Mock).mockRejectedValue(new ConflictException('Exists'));

            await expect(
                service.register({ email: 'test@test.com', password: 'Test1234!', firstName: 'A', lastName: 'B' }),
            ).rejects.toThrow(ConflictException);

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });
    });

    describe('verifyOtp', () => {
        it('verifies a valid, non-expired OTP', async () => {
            const hashedOtp = await bcrypt.hash('123456', 10);
            const futureDate = new Date(Date.now() + 5 * 60 * 1000);

            mockUsersService.findByEmail.mockResolvedValue({
                id: 'user-uuid',
                email: 'test@test.com',
                isVerified: false,
                otp: hashedOtp,
                otpExpiresAt: futureDate,
            });
            mockUsersService.update.mockResolvedValue(undefined);

            const result = await service.verifyOtp({ email: 'test@test.com', otp: '123456' });
            expect(result.message).toContain('verified successfully');
            expect(mockUsersService.update).toHaveBeenCalledWith('user-uuid', expect.objectContaining({ isVerified: true }));
        });

        it('rejects expired OTP', async () => {
            const hashedOtp = await bcrypt.hash('123456', 10);
            const pastDate = new Date(Date.now() - 1000);

            mockUsersService.findByEmail.mockResolvedValue({
                id: 'user-uuid',
                isVerified: false,
                otp: hashedOtp,
                otpExpiresAt: pastDate,
            });

            await expect(service.verifyOtp({ email: 'test@test.com', otp: '123456' })).rejects.toThrow(
                BadRequestException,
            );
        });

        it('rejects invalid OTP', async () => {
            const hashedOtp = await bcrypt.hash('999999', 10);
            const futureDate = new Date(Date.now() + 5 * 60 * 1000);

            mockUsersService.findByEmail.mockResolvedValue({
                isVerified: false,
                otp: hashedOtp,
                otpExpiresAt: futureDate,
            });

            await expect(service.verifyOtp({ email: 'test@test.com', otp: '000000' })).rejects.toThrow(
                UnauthorizedException,
            );
        });
    });

    describe('login', () => {
        it('returns a JWT on valid credentials', async () => {
            const hashedPassword = await bcrypt.hash('Test1234!', 12);
            mockUsersService.findByEmail.mockResolvedValue({
                id: 'user-uuid',
                email: 'test@test.com',
                password: hashedPassword,
                isVerified: true,
                firstName: 'Test',
                lastName: 'User',
                role: 'USER',
            });
            mockUsersService.update.mockResolvedValue(undefined);

            const result = await service.login({ email: 'test@test.com', password: 'Test1234!' });

            expect(result.accessToken).toBe('mock_jwt_token');
            expect(result.user.email).toBe('test@test.com');
        });

        it('rejects unverified user', async () => {
            mockUsersService.findByEmail.mockResolvedValue({ isVerified: false, password: 'hashed' });

            await expect(service.login({ email: 'test@test.com', password: 'pw' })).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('rejects wrong password', async () => {
            const hashedPassword = await bcrypt.hash('correct_password', 12);
            mockUsersService.findByEmail.mockResolvedValue({ isVerified: true, password: hashedPassword });

            await expect(service.login({ email: 'test@test.com', password: 'wrong_password' })).rejects.toThrow(
                UnauthorizedException,
            );
        });
    });
});