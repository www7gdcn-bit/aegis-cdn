import { Module } from "@nestjs/common";
import { ConfigCompilerService } from "./config-compiler.service";
import { ProtectionService } from "./protection.service";
import { ProtectionController } from "./protection.controller";
import { BillingModule } from "../billing/billing.module";

@Module({
  imports: [BillingModule], // 功能门控(CC/WAF 按套餐)
  providers: [ConfigCompilerService, ProtectionService],
  controllers: [ProtectionController],
  exports: [ConfigCompilerService],
})
export class ProtectionModule {}
