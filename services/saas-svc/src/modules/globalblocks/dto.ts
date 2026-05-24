import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export type BlockType = "ip" | "cidr" | "domain" | "tenant";
export type BlockStatus = "active" | "released" | "expired";

export class CreateBlockDto {
  @IsIn(["ip", "cidr", "domain", "tenant"])
  type!: BlockType;

  @IsString() @MaxLength(253)
  value!: string;                  // 单 IP / CIDR / 域名 / tenantId 字符串

  @IsOptional() @IsInt() @Min(1)
  tenantId?: number;               // 该封禁源自/属于的 tenant

  @IsOptional() @IsInt() @Min(1)
  domainId?: number;               // type=domain 时 必填 SaasDomain.id

  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;

  @IsOptional() @IsBoolean()
  isPermanent?: boolean;

  // ISO 8601;isPermanent=true 时忽略
  @IsOptional() @IsString()
  expiresAt?: string;
}

export class ReleaseBlockDto {
  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}

export class ListBlocksQueryDto {
  @IsOptional() @IsIn(["ip", "cidr", "domain", "tenant"])
  type?: BlockType;

  @IsOptional() @IsIn(["active", "released", "expired"])
  status?: BlockStatus;

  @IsOptional() @IsInt() @Min(1)
  tenantId?: number;

  @IsOptional() @IsInt() @Min(1)
  domainId?: number;

  @IsOptional() @IsString()
  value?: string;                  // 模糊 contains 查 IP

  @IsOptional() @IsString()
  reason?: string;
}
