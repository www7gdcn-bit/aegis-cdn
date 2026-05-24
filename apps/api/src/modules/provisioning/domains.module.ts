import { Module } from "@nestjs/common";
import { DomainsService } from "./domains.service";
import { DomainsController } from "./domains.controller";
import { ConfigCompilerService } from "./config-compiler.service";
import { BillingModule } from "../billing/billing.module";

// provisioning 模块:域名接入 + 配置编译下发。
// 暂保留 DomainsModule 名(Step 1 不改名)。导出 ConfigCompilerService 供 security-policy / compliance 复用。
@Module({
  imports: [BillingModule],
  providers: [DomainsService, ConfigCompilerService],
  controllers: [DomainsController],
  exports: [ConfigCompilerService],
})
export class DomainsModule {}
