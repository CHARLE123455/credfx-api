import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Role } from './enums/role.enum';

type UserUpdatePayload = {
  isVerified?: boolean;
  otp?: string;
  otpExpiresAt?: Date;
  role?: Role;
  lastLoginAt?: Date;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(data: Partial<User>): Promise<User> {
    const existing = await this.usersRepository.findOne({
      where: { email: data.email },
    });
    if (existing)
      throw new ConflictException('An account with this email already exists');

    const user = this.usersRepository.create(data);
    return this.usersRepository.save(user);
  }

  async findByEmail(
    email: string,
    includeSecrets = false,
  ): Promise<User | null> {
    const query = this.usersRepository
      .createQueryBuilder('user')
      .where('user.email = :email', { email });

    if (includeSecrets) {
      query.addSelect(['user.password', 'user.otp']);
    }

    return query.getOne();
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, data: UserUpdatePayload): Promise<void> {
    await this.usersRepository.update(id, data);
  }

  async findAll(
    page = 1,
    limit = 20,
  ): Promise<{ users: User[]; total: number }> {
    const [users, total] = await this.usersRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { users, total };
  }
}
