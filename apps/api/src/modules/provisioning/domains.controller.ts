import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common";
import { DomainsService } from "./domains.service";
import { CreateDomainDto } from "./dto";
import { JwtAuthGuard, AuthUser } from "../../core/common/jwt-auth.guard";
import { CurrentUser } from "../../core/common/current-user.decorator";
import { ConfigCompilerService } from "./config-compiler.service";

@UseGuards(JwtAuthGuard)
@Controller("domains")
export class DomainsController {
  constructor(private domains: DomainsService, private compiler: ConfigCompilerService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.domains.list(u.tenantId!);
  }

  @Get(":id")
  get(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.domains.get(u.tenantId!, id);
  }

  @Post()
  async create(@CurrentUser() u: AuthUser, @Body() dto: CreateDomainDto) {
    const d = await this.domains.create(u.tenantId!, dto);
    await this.compiler.compileAndPush(d.id); // 接入即下发(pending 占位配置)
    return d;
  }

  @Delete(":id")
  remove(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.domains.remove(u.tenantId!, id);
  }
  // 注:域名激活改由平台「接入审核」(/api/v1/admin/reviews)完成,客户不可自助激活。
}
