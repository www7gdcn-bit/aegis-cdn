import { Module } from "@nestjs/common";
import { PlansService } from "./plans.service";
import { PlansController } from "./plans.controller";

@Module({
  providers: [PlansService],
  controllers: [PlansController],
  exports: [PlansService], // subscriptions/orders 模块要用
})
export class PlansModule {}
