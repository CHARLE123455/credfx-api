import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Unique,
} from 'typeorm';
import { Wallet } from './wallet.entity';

const numericTransformer = {
    to: (value: number): number => value,
    from: (value: string): number => parseFloat(value ?? '0'),
};

@Entity('wallet_balances')
@Unique(['walletId', 'currency'])
export class WalletBalance {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Wallet, (wallet) => wallet.balances, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'walletId' })
    wallet: Wallet;

    @Column()
    walletId: string;

    @Column({ length: 3 })
    currency: string;

    @Column({
        type: 'decimal',
        precision: 20,
        scale: 6,
        default: 0,
        transformer: numericTransformer,
    })
    balance: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}