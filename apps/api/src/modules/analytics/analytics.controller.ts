import { Controller, Get, UseGuards } from "@nestjs/common";
import { AnalyticsService } from "./analytics.service";
import { JwtAuthGuard } from "../../core/common/jwt-auth.guard";
import { RolesGuard } from "../../core/common/roles.guard";
import { Roles } from "../../core/common/roles.decorator";

// 攻击可视化数据(平台全局视图)。含全量客户攻击数据,仅平台管理员/运营可见 —— 必须鉴权。
// 路由保持 /stats(前端契约不变)。
@Controller("stats")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "operator")
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  @Get("security")
  security() {
    return this.analytics.security();
  }
}
