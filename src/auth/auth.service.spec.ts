import { MailService } from '@mail/mail.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '@users/entities/user.entity';
import { UsersService } from '@users/users.service';
import { WalletBalance } from '@wallet/entities/wallet-balance.entity';
import { Wallet } from '@wallet/entities/wallet.entity';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { AuthService } from './auth.service';

const makeRepoMock = () => ({
  create: jest.fn((data: Record<string, unknown>) => ({ ...data })),
  save: jest.fn((entity: Record<string, unknown>) => Promise.resolve(entity)),
  findOne: jest.fn(),
});

const userRepoMock = makeRepoMock();
const walletRepoMock = makeRepoMock();
const balanceRepoMock = makeRepoMock();

const mockQueryRunner = {
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: {
    withRepository: jest.fn((repo) => {
      if (repo === userRepoMock) return userRepoMock;
      if (repo === walletRepoMock) return walletRepoMock;
      if (repo === balanceRepoMock) return balanceRepoMock;
      return makeRepoMock();
    }),
  },
};

const mockDataSource = {
  createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

const mockUsersService = {
  findByEmail: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
};

const mockJwtService = { sign: jest.fn().mockReturnValue('mock_jwt_token') };
const mockConfigService = {
  get: jest.fn().mockReturnValue(1000),
  getOrThrow: jest.fn().mockReturnValue('secret'),
};
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
        { provide: getRepositoryToken(User), useValue: userRepoMock },
        { provide: getRepositoryToken(Wallet), useValue: walletRepoMock },
        {
          provide: getRepositoryToken(WalletBalance),
          useValue: balanceRepoMock,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();

    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
    mockQueryRunner.manager.withRepository.mockImplementation(
      (repo: unknown) => {
        if (repo === userRepoMock) return userRepoMock;
        if (repo === walletRepoMock) return walletRepoMock;
        if (repo === balanceRepoMock) return balanceRepoMock;
        return makeRepoMock();
      },
    );
  });

  describe('register', () => {
    it('creates a user, wallet, and sends OTP email', async () => {
      const savedUser = {
        id: 'user-uuid',
        email: 'test@test.com',
        firstName: 'Test',
      };
      const savedWallet = { id: 'wallet-uuid' };

      userRepoMock.create.mockReturnValue(savedUser);
      userRepoMock.save.mockResolvedValue(savedUser);
      walletRepoMock.create.mockReturnValue(savedWallet);
      walletRepoMock.save.mockResolvedValue(savedWallet);
      balanceRepoMock.create.mockReturnValue({});
      balanceRepoMock.save.mockResolvedValue({});

      const result = await service.register({
        email: 'test@test.com',
        password: 'Test1234!',
        firstName: 'Test',
        lastName: 'User',
      });

      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockMailService.sendOtp).toHaveBeenCalledWith(
        'test@test.com',
        'Test',
        expect.any(String),
      );
      expect(result.message).toContain('OTP has been sent');
    });

    it('rolls back transaction on error', async () => {
      userRepoMock.save.mockRejectedValue(new Error('DB error'));

      await expect(
        service.register({
          email: 'test@test.com',
          password: 'Test1234!',
          firstName: 'A',
          lastName: 'B',
        }),
      ).rejects.toThrow();

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    it('verifies a valid, non-expired OTP', async () => {
      const hashedOtp = await bcrypt.hash('123456', 10);

      mockUsersService.findByEmail.mockResolvedValue({
        id: 'user-uuid',
        email: 'test@test.com',
        isVerified: false,
        otp: hashedOtp,
        otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });
      mockUsersService.update.mockResolvedValue(undefined);

      const result = await service.verifyOtp({
        email: 'test@test.com',
        otp: '123456',
      });

      expect(result.message).toContain('verified successfully');
      expect(mockUsersService.update).toHaveBeenCalledWith(
        'user-uuid',
        expect.objectContaining({ isVerified: true }),
      );
    });

    it('rejects expired OTP', async () => {
      const hashedOtp = await bcrypt.hash('123456', 10);

      mockUsersService.findByEmail.mockResolvedValue({
        id: 'user-uuid',
        isVerified: false,
        otp: hashedOtp,
        otpExpiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.verifyOtp({ email: 'test@test.com', otp: '123456' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid OTP', async () => {
      const hashedOtp = await bcrypt.hash('999999', 10);

      mockUsersService.findByEmail.mockResolvedValue({
        isVerified: false,
        otp: hashedOtp,
        otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      await expect(
        service.verifyOtp({ email: 'test@test.com', otp: '000000' }),
      ).rejects.toThrow(UnauthorizedException);
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

      const result = await service.login({
        email: 'test@test.com',
        password: 'Test1234!',
      });

      expect(result.accessToken).toBe('mock_jwt_token');
      expect(result.user.email).toBe('test@test.com');
    });

    it('rejects unverified user', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        isVerified: false,
        password: 'hashed',
      });

      await expect(
        service.login({ email: 'test@test.com', password: 'pw' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects wrong password', async () => {
      const hashedPassword = await bcrypt.hash('correct_password', 12);

      mockUsersService.findByEmail.mockResolvedValue({
        isVerified: true,
        password: hashedPassword,
      });

      await expect(
        service.login({ email: 'test@test.com', password: 'wrong_password' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
