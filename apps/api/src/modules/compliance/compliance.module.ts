import { Module } from "@nestjs/common";
import { ComplianceService } from "./compliance.service";
import { ComplianceController } from "./compliance.controller";
import { AdminComplianceController } from "./admin-compliance.controller";
import { ProvisioningModule } from "../provisioning/provisioning.module";

@Module({
  imports: [ProvisioningModule], // 复用 ConfigCompilerService(审核/封禁后重新下发)
  providers: [ComplianceService],
  controllers: [ComplianceController, AdminComplianceController],
})
export class ComplianceModule {}
