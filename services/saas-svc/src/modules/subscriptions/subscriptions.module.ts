import { Module } from "@nestjs/common";
import { SubscriptionsService } from "./subscriptions.service";
import { SubscriptionsController } from "./subscriptions.controller";
import { PlansModule } from "../plans/plans.module";

@Module({
  imports: [PlansModule],
  providers: [SubscriptionsService],
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService], // orders + /internal/quota 要用
})
export class SubscriptionsModule {}
