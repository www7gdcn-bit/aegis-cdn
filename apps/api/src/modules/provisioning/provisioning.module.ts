import { Module } from "@nestjs/common";
import { ProvisioningService } from "./provisioning.service";
import { ProvisioningController } from "./provisioning.controller";
import { ConfigCompilerService } from "./config-compiler.service";

// provisioning 模块:域名接入 + 配置编译下发。
// QuotaClient 来自 @Global() QuotaClientModule,无需 import。
@Module({
  providers: [ProvisioningService, ConfigCompilerService],
  controllers: [ProvisioningController],
  exports: [ConfigCompilerService],
})
export class ProvisioningModule {}
