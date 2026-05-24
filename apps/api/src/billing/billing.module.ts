import { Module } from "@nestjs/common";
import { BillingService } from "./billing.service";
import { BillingController } from "./billing.controller";

@Module({
  providers: [BillingService],
  controllers: [BillingController],
  exports: [BillingService], // 供 domains(配额)/ protection(功能门控)使用
})
export class BillingModule {}
