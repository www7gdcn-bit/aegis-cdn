import { Controller, Get, UseGuards } from "@nestjs/common";
import { StatsService } from "./stats.service";
import { JwtAuthGuard } from "../../core/common/jwt-auth.guard";
import { RolesGuard } from "../../core/common/roles.guard";
import { Roles } from "../../core/common/roles.decorator";

// 攻击可视化数据(平台全局视图)。含全量客户攻击数据,仅平台管理员/运营可见 —— 必须鉴权。
@Controller("stats")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "operator")
export class StatsController {
  constructor(private stats: StatsService) {}

  @Get("security")
  security() {
    return this.stats.security();
  }
}
