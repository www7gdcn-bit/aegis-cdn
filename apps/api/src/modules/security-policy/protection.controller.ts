import { Body, Controller, Delete, Param, ParseIntPipe, Post, Put, UseGuards } from "@nestjs/common";
import { ProtectionService } from "./protection.service";
import { JwtAuthGuard, AuthUser } from "../../core/common/jwt-auth.guard";
import { CurrentUser } from "../../core/common/current-user.decorator";
import { CreateAclDto, CreateRateRuleDto, CreateWafRuleDto, UpdateCcDto, UpdateWafDto } from "./dto";

@UseGuards(JwtAuthGuard)
@Controller("domains/:id")
export class ProtectionController {
  constructor(private svc: ProtectionService) {}

  @Put("cc")
  cc(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number, @Body() dto: UpdateCcDto) {
    return this.svc.updateCc(u.tenantId!, id, dto);
  }

  @Put("waf")
  waf(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number, @Body() dto: UpdateWafDto) {
    return this.svc.updateWaf(u.tenantId!, id, dto);
  }

  @Post("waf-rules")
  addWafRule(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number, @Body() dto: CreateWafRuleDto) {
    return this.svc.addWafRule(u.tenantId!, id, dto);
  }

  @Delete("waf-rules/:rid")
  delWafRule(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number, @Param("rid", ParseIntPipe) rid: number) {
    return this.svc.deleteWafRule(u.tenantId!, id, rid);
  }

  @Post("acl")
  addAcl(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number, @Body() dto: CreateAclDto) {
    return this.svc.addAcl(u.tenantId!, id, dto);
  }

  @Delete("acl/:rid")
  delAcl(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number, @Param("rid", ParseIntPipe) rid: number) {
    return this.svc.deleteAcl(u.tenantId!, id, rid);
  }

  @Post("rate-rules")
  addRate(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number, @Body() dto: CreateRateRuleDto) {
    return this.svc.addRateRule(u.tenantId!, id, dto);
  }

  @Delete("rate-rules/:rid")
  delRate(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number, @Param("rid", ParseIntPipe) rid: number) {
    return this.svc.deleteRateRule(u.tenantId!, id, rid);
  }

  // 预览/手动重新下发到边缘
  @Post("deploy")
  deploy(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.svc.preview(u.tenantId!, id);
  }
}
