import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from "@nestjs/common";
import { GlobalBlocksService } from "./globalblocks.service";
import { ListBlocksQueryDto } from "./dto";
import { JwtAuthGuard, AuthUser } from "../../core/common/jwt-auth.guard";
import { CurrentUser } from "../../core/common/current-user.decorator";

// 用户视角:仅自己 Tenant 关联的封禁记录(tenantId 强制过滤)。
// 用户不能创建/释放封禁,只能查看由 admin 或 WAF/CC 自动触发的封禁。
@UseGuards(JwtAuthGuard)
@Controller("blocks")
export class GlobalBlocksController {
  constructor(private blocks: GlobalBlocksService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query() query: ListBlocksQueryDto) {
    return this.blocks.listForTenant(u.tenantId!, query);
  }

  @Get(":id")
  async getOne(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    const b = await this.blocks.getById(id);
    // 强制 tenant 边界
    if (b.tenantId !== u.tenantId) {
      // 不暴露存在性:统一返 404
      return { error: "not found", code: "NOT_FOUND" };
    }
    return b;
  }
}
