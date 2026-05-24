import { Module } from "@nestjs/common";
import { ComplianceService } from "./compliance.service";
import { ComplianceController } from "./compliance.controller";
import { AdminComplianceController } from "./admin.controller";
import { ProtectionModule } from "../protection/protection.module";

@Module({
  imports: [ProtectionModule], // 复用 ConfigCompilerService(审核/封禁后重新下发)
  providers: [ComplianceService],
  controllers: [ComplianceController, AdminComplianceController],
})
export class ComplianceModule {}
