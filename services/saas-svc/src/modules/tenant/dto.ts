import { IsInt, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;
}

// Phase 3 由 bff-edge 调用 /internal/user/provision 后回写 edgeUserId
export class SetEdgeUserIdDto {
  @IsInt()
  edgeUserId!: number;
}
