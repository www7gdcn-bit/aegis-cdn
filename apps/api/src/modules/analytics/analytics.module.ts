import { Module } from "@nestjs/common";
import { ClickHouseService } from "./clickhouse.service";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsController } from "./analytics.controller";

@Module({
  providers: [ClickHouseService, AnalyticsService],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
