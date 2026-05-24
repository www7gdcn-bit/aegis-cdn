import { Module } from "@nestjs/common";
import { ComplianceService } from "./compliance.service";
import { AdminComplianceController } from "./admin-compliance.controller";
import { ProvisioningModule } from "../provisioning/provisioning.module";

// Phase 2 之后仅含管理侧(接入审核 + 封禁)。KYC 已迁 saas-svc。
@Module({
  imports: [ProvisioningModule], // 复用 ConfigCompilerService(审核/封禁后重新下发)
  providers: [ComplianceService],
  controllers: [AdminComplianceController],
})
export class ComplianceModule {}
