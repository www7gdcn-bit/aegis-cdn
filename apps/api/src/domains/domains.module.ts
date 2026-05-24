import { Module } from "@nestjs/common";
import { DomainsService } from "./domains.service";
import { DomainsController } from "./domains.controller";
import { ProtectionModule } from "../protection/protection.module";
import { BillingModule } from "../billing/billing.module";

@Module({
  imports: [ProtectionModule, BillingModule], // ConfigCompilerService + 配额校验
  providers: [DomainsService],
  controllers: [DomainsController],
})
export class DomainsModule {}
