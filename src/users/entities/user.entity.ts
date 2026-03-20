/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Transaction } from '@transactions/entities/transaction.entity';
import { Wallet } from '@wallet/entities/wallet.entity';
import * as bcrypt from 'bcryptjs';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../enums/role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, length: 255 })
  email!: string;

  @Column({ select: false })
  password!: string;

  @Column({ length: 100 })
  firstName!: string;

  @Column({ length: 100 })
  lastName!: string;

  @Column({ default: false })
  isVerified: boolean = false;

  @Column({ nullable: true, select: false })
  otp!: string;

  @Column({ nullable: true })
  otpExpiresAt!: Date;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role = Role.USER;

  @Column({ nullable: true })
  lastLoginAt!: Date;

  @OneToOne(() => Wallet, (wallet) => wallet.user, { cascade: true })
  wallet!: Wallet;

  @OneToMany(() => Transaction, (transaction) => transaction.user)
  transactions!: Transaction[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  async hashPassword(): Promise<void> {
    this.password = await bcrypt.hash(this.password, 12);
  }
}
