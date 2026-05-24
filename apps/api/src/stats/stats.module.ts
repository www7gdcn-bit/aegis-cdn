import { Module } from "@nestjs/common";
import { ClickHouseService } from "./clickhouse.service";
import { StatsService } from "./stats.service";
import { StatsController } from "./stats.controller";

@Module({
  providers: [ClickHouseService, StatsService],
  controllers: [StatsController],
})
export class StatsModule {}
