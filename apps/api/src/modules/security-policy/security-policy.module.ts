import { Module } from "@nestjs/common";
import { ProtectionService } from "./protection.service";
import { ProtectionController } from "./protection.controller";
import { BillingModule } from "../billing/billing.module";
import { ProvisioningModule } from "../provisioning/provisioning.module";

// security-policy 模块:CC/WAF/ACL/RateRule CRUD。
// ConfigCompilerService 由 ProvisioningModule 提供,这里 import 进来用。
@Module({
  imports: [BillingModule, ProvisioningModule],
  providers: [ProtectionService],
  controllers: [ProtectionController],
})
export class SecurityPolicyModule {}
