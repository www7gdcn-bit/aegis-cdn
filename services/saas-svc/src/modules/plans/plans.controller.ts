import { Controller, Get } from "@nestjs/common";
import { PlansService } from "./plans.service";

// 公开:套餐目录(浏览器/官网都可调,无需登录)
@Controller("plans")
export class PlansController {
  constructor(private plans: PlansService) {}

  @Get()
  list() {
    return this.plans.listActive();
  }
}
