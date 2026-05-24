import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "aegis_roles";
// 标注接口所需角色,配合 RolesGuard 使用。例:@Roles("admin", "operator")
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
