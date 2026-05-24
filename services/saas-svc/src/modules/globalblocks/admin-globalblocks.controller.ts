import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from "@nestjs/common";
import { GlobalBlocksService } from "./globalblocks.service";
import { CreateBlockDto, ListBlocksQueryDto, ReleaseBlockDto } from "./dto";
import { JwtAuthGuard, AuthUser } from "../../core/common/jwt-auth.guard";
import { RolesGuard } from "../../core/common/roles.guard";
import { Roles } from "../../core/common/roles.decorator";
import { CurrentUser } from "../../core/common/current-user.decorator";

// 管理员视角:全平台封禁 CRUD。
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "operator")
@Controller("admin/blocks")
export class AdminGlobalBlocksController {
  constructor(private blocks: GlobalBlocksService) {}

  @Get()
  list(@Query() query: ListBlocksQueryDto) {
    return this.blocks.listForAdmin(query);
  }

  @Get(":id")
  getOne(@Param("id", ParseIntPipe) id: number) {
    return this.blocks.getById(id);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateBlockDto) {
    return this.blocks.create(dto, u.id);
  }

  @Post(":id/release")
  release(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ReleaseBlockDto,
  ) {
    return this.blocks.release(id, u.id, dto.reason);
  }

  /** 同步失败时手动重试(syncStatus=failed → pending → 再次调 bff-edge) */
  @Post(":id/retry-sync")
  retrySync(@Param("id", ParseIntPipe) id: number) {
    return this.blocks.retrySync(id);
  }
}
