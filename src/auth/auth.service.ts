import { MailService } from '@mail/mail.service';
import {
    BadRequestException,
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@users/entities/user.entity';
import { UsersService } from '@users/users.service';
import { WalletBalance } from '@wallet/entities/wallet-balance.entity';
import { Wallet } from '@wallet/entities/wallet.entity';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly mailService: MailService,
        private readonly dataSource: DataSource,
    ) { }

    async register(dto: RegisterDto): Promise<{ message: string }> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const otp = this.generateOtp();
            const otpHash = await bcrypt.hash(otp, 10);
            const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

            const user = queryRunner.manager.create(User, {
                ...dto,
                otp: otpHash,
                otpExpiresAt,
            });
            const savedUser = await queryRunner.manager.save(User, user);

            const initialBalance = this.configService.get<number>('INITIAL_NGN_BALANCE', 1000);
            const wallet = queryRunner.manager.create(Wallet, { user: savedUser });
            const savedWallet = await queryRunner.manager.save(Wallet, wallet);

            const ngnBalance = queryRunner.manager.create(WalletBalance, {
                wallet: savedWallet,
                currency: 'NGN',
                balance: initialBalance,
            });
            await queryRunner.manager.save(WalletBalance, ngnBalance);

            await queryRunner.commitTransaction();

            await this.mailService.sendOtp(dto.email, dto.firstName, otp);

            return { message: `Registration successful. An OTP has been sent to ${dto.email}` };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async verifyOtp(dto: VerifyOtpDto): Promise<{ message: string }> {
        const user = await this.usersService.findByEmail(dto.email, true);

        if (!user || !user.otp || !user.otpExpiresAt) {
            throw new BadRequestException('Invalid OTP request');
        }

        if (user.isVerified) {
            throw new BadRequestException('This account is already verified');
        }

        if (new Date() > user.otpExpiresAt) {
            throw new BadRequestException('OTP has expired. Please request a new one');
        }

        const isValid = await bcrypt.compare(dto.otp, user.otp);
        if (!isValid) {
            throw new UnauthorizedException('Invalid OTP');
        }

        await this.usersService.update(user.id, {
            isVerified: true,
            otp: undefined,
            otpExpiresAt: undefined,
        });

        return { message: 'Email verified successfully. You can now log in.' };
    }

    async resendOtp(email: string): Promise<{ message: string }> {
        const user = await this.usersService.findByEmail(email);
        if (!user) throw new BadRequestException('No account found with this email');
        if (user.isVerified) throw new BadRequestException('Account is already verified');

        const otp = this.generateOtp();
        const otpHash = await bcrypt.hash(otp, 10);
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await this.usersService.update(user.id, { otp: otpHash, otpExpiresAt });
        await this.mailService.sendOtp(email, user.firstName, otp);

        return { message: `A new OTP has been sent to ${email}` };
    }

    async login(dto: LoginDto): Promise<{ accessToken: string; user: Partial<User> }> {
        const user = await this.usersService.findByEmail(dto.email, true);

        if (!user) throw new UnauthorizedException('Invalid credentials');
        if (!user.isVerified) {
            throw new UnauthorizedException('Please verify your email before logging in');
        }

        const passwordMatch = await bcrypt.compare(dto.password, user.password);
        if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

        await this.usersService.update(user.id, { lastLoginAt: new Date() });

        const payload = { sub: user.id, email: user.email, role: user.role };
        const accessToken = this.jwtService.sign(payload);

        return {
            accessToken,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                isVerified: user.isVerified,
            },
        };
    }

    async getProfile(userId: string): Promise<User> {
        return this.usersService.findById(userId);
    }

    private generateOtp(): string {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
}