import { Module } from "@nestjs/common";
import { DomainsService } from "./domains.service";
import { DomainsController } from "./domains.controller";
import { DomainVerificationService } from "./domain-verification.service";
import { DomainVerificationCron } from "./domain-verification.cron";
import { SslService } from "./ssl.service";
import { SslAutoIssueCron } from "./ssl.cron";
import { AdminDomainsController } from "./admin-domains.controller";

@Module({
  providers: [
    DomainsService,
    DomainVerificationService,
    DomainVerificationCron,
    SslService,
    SslAutoIssueCron,
  ],
  controllers: [DomainsController, AdminDomainsController],
  exports: [DomainsService, DomainVerificationService, SslService],
})
export class DomainsModule {}
