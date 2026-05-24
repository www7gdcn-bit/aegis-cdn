import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards,
} from "@nestjs/common";
import { DomainsService } from "./domains.service";
import { AddDomainDto } from "./dto";
import { JwtAuthGuard, AuthUser } from "../../core/common/jwt-auth.guard";
import { CurrentUser } from "../../core/common/current-user.decorator";

// 用户视角:管自己 Tenant 下的域名。
@UseGuards(JwtAuthGuard)
@Controller("domains")
export class DomainsController {
  constructor(private domains: DomainsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.domains.list(u.tenantId!);
  }

  @Post()
  add(@CurrentUser() u: AuthUser, @Body() dto: AddDomainDto) {
    return this.domains.add(u.tenantId!, dto);
  }

  @Get(":id")
  get(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.domains.getById(u.tenantId!, id);
  }

  // 单独返回 CNAME 配置指引(便于前端 UI 复用)
  @Get(":id/cname")
  cname(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.domains.getCname(u.tenantId!, id);
  }

  @Delete(":id")
  remove(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.domains.remove(u.tenantId!, id);
  }

  @Post(":id/pause")
  pause(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.domains.pause(u.tenantId!, id);
  }

  @Post(":id/resume")
  resume(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.domains.resume(u.tenantId!, id);
  }
}
