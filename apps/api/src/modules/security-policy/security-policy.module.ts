import { Module } from "@nestjs/common";
import { SecurityPolicyService } from "./security-policy.service";
import { SecurityPolicyController } from "./security-policy.controller";
import { ProvisioningModule } from "../provisioning/provisioning.module";

// security-policy 模块:CC/WAF/ACL/RateRule CRUD。
// ConfigCompilerService 由 ProvisioningModule 提供;QuotaClient 来自 @Global() QuotaClientModule。
@Module({
  imports: [ProvisioningModule],
  providers: [SecurityPolicyService],
  controllers: [SecurityPolicyController],
})
export class SecurityPolicyModule {}
