import { Module } from "@nestjs/common";
import { DomainsService } from "./domains.service";
import { DomainsController } from "./domains.controller";
import { DomainVerificationService } from "./domain-verification.service";
import { DomainVerificationCron } from "./domain-verification.cron";
import { AdminDomainsController } from "./admin-domains.controller";

@Module({
  providers: [DomainsService, DomainVerificationService, DomainVerificationCron],
  controllers: [DomainsController, AdminDomainsController],
  exports: [DomainsService, DomainVerificationService],
})
export class DomainsModule {}
