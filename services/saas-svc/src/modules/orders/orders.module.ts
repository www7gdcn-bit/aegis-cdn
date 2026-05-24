import { Module } from "@nestjs/common";
import { OrdersService } from "./orders.service";
import { OrdersController } from "./orders.controller";
import { PlansModule } from "../plans/plans.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";

@Module({
  imports: [PlansModule, SubscriptionsModule],
  providers: [OrdersService],
  controllers: [OrdersController],
  exports: [OrdersService], // payment 模块要用 fulfill()
})
export class OrdersModule {}
