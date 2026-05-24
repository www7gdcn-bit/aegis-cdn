import { IsEmail, IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

// POST /internal/edge/users — saas-svc 调
export class CreateEdgeUserDto {
  // 来自 saas-svc 的 Tenant.id;bff-edge 不直连 saas-svc DB,只把它作为 GoEdge user remark
  @IsInt()
  tenantId!: number;

  // GoEdge 侧 username(唯一);saas-svc 通常用 "saas-tenant-<id>" 或邮箱前缀
  @IsString() @MinLength(1) @MaxLength(64)
  username!: string;

  @IsOptional() @IsEmail() @MaxLength(128)
  email?: string;

  @IsOptional() @IsString() @MaxLength(255)
  remark?: string;
}

export type CreateEdgeUserResult = {
  edgeUserId: number;
  username: string;
};
