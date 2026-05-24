import { Module } from "@nestjs/common";
import { SecurityPolicyService } from "./security-policy.service";
import { SecurityPolicyController } from "./security-policy.controller";
import { BillingModule } from "../billing/billing.module";
import { ProvisioningModule } from "../provisioning/provisioning.module";

// security-policy 模块:CC/WAF/ACL/RateRule CRUD。
// ConfigCompilerService 由 ProvisioningModule 提供,这里 import 进来用。
@Module({
  imports: [BillingModule, ProvisioningModule],
  providers: [SecurityPolicyService],
  controllers: [SecurityPolicyController],
})
export class SecurityPolicyModule {}
