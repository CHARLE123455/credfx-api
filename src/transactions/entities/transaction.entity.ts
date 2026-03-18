import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    Index,
} from 'typeorm';
import { User } from '@users/entities/user.entity';
import { TransactionType } from '../enums/transaction-type.enum';
import { TransactionStatus } from '../enums/transaction-status.enum';

const numericTransformer = {
    to: (value: number): number => value,
    from: (value: string): number => parseFloat(value ?? '0'),
};

@Entity('transactions')
@Index(['userId', 'createdAt'])
export class Transaction {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => User, (user) => user.transactions, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column()
    @Index()
    userId: string;

    @Column({ type: 'enum', enum: TransactionType })
    type: TransactionType;

    @Column({ length: 3 })
    fromCurrency: string;

    @Column({ length: 3, nullable: true })
    toCurrency: string;

    @Column({ type: 'decimal', precision: 20, scale: 6, transformer: numericTransformer })
    amount: number;

    @Column({
        type: 'decimal',
        precision: 20,
        scale: 6,
        nullable: true,
        transformer: numericTransformer,
    })
    convertedAmount: number;

    @Column({
        type: 'decimal',
        precision: 20,
        scale: 10,
        nullable: true,
        transformer: numericTransformer,
    })
    rateUsed: number;

    @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true, transformer: numericTransformer })
    feePercent: number;

    @Column({ type: 'decimal', precision: 20, scale: 6, nullable: true, transformer: numericTransformer })
    feeAmount: number;

    @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.SUCCESS })
    status: TransactionStatus;

    @Column({ unique: true })
    @Index()
    reference: string;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, unknown>;

    @CreateDateColumn()
    createdAt: Date;
}