import { Module } from "@nestjs/common";
import { ProvisioningService } from "./provisioning.service";
import { ProvisioningController } from "./provisioning.controller";
import { ConfigCompilerService } from "./config-compiler.service";
import { BillingModule } from "../billing/billing.module";

// provisioning 模块:域名接入 + 配置编译下发。
// 导出 ConfigCompilerService 供 security-policy / compliance 复用。
@Module({
  imports: [BillingModule],
  providers: [ProvisioningService, ConfigCompilerService],
  controllers: [ProvisioningController],
  exports: [ConfigCompilerService],
})
export class ProvisioningModule {}
