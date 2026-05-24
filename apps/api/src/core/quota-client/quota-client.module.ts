import { Global, Module } from "@nestjs/common";
import { QuotaClient } from "./quota-client.service";

// @Global 让 provisioning / security-policy / config-compiler 等模块无需各自 import
@Global()
@Module({
  providers: [QuotaClient],
  exports: [QuotaClient],
})
export class QuotaClientModule {}
