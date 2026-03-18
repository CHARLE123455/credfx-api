import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('fx_rate_snapshots')
export class FxRateSnapshot {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ length: 3 })
    @Index()
    baseCurrency: string;

    @Column({ type: 'jsonb' })
    rates: Record<string, number>;

    @Column()
    source: string;

    @CreateDateColumn()
    fetchedAt: Date;
}