import { Global, Module } from "@nestjs/common";
import { EdgeApiClient } from "./edge-api.client";

// @Global 让 modules/* 拿到 EdgeApiClient 无需各自 import
@Global()
@Module({
  providers: [EdgeApiClient],
  exports: [EdgeApiClient],
})
export class EdgeApiModule {}
