import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { TenantService } from "./tenant.service";
import { UpdateTenantDto } from "./dto";
import { JwtAuthGuard, AuthUser } from "../../core/common/jwt-auth.guard";
import { CurrentUser } from "../../core/common/current-user.decorator";

@UseGuards(JwtAuthGuard)
@Controller("tenant")
export class TenantController {
  constructor(private tenant: TenantService) {}

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.tenant.getById(user.tenantId!);
  }

  @Patch("me")
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateTenantDto) {
    return this.tenant.update(user.tenantId!, dto);
  }
}
