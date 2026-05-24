import { Module } from "@nestjs/common";
import { ProtectionService } from "./protection.service";
import { ProtectionController } from "./protection.controller";
import { BillingModule } from "../billing/billing.module";
import { DomainsModule } from "../provisioning/domains.module";

// security-policy 模块:CC/WAF/ACL/RateRule CRUD。
// ConfigCompilerService 现在归 provisioning(DomainsModule)所有,这里 import 进来用。
@Module({
  imports: [BillingModule, DomainsModule],
  providers: [ProtectionService],
  controllers: [ProtectionController],
})
export class ProtectionModule {}
