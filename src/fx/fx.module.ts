import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FxService } from './fx.service';
import { FxController } from './fx.controller';
import { FxRateSnapshot } from './entities/fx-rate-snapshot.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FxRateSnapshot])],
  providers: [FxService],
  controllers: [FxController],
  exports: [FxService],
})
export class FxModule {}
