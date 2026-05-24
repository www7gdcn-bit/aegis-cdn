import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

// POST /internal/edge/blocks — saas-svc 调,加 IPItem 到平台共享黑名单
export class AddBlockDto {
  // 必填 ipListId(平台共享 IPList id);saas-svc 从 env EDGE_GLOBAL_BLOCK_LIST_ID 注入
  @IsInt() @Min(1) ipListId!: number;

  @IsString() @MaxLength(64)
  value!: string;                 // 单 IP / CIDR / IP 范围

  @IsIn(["ipv4", "ipv6"])
  type!: "ipv4" | "ipv6";

  @IsOptional() @IsString() @MaxLength(255)
  reason?: string;

  // ISO 8601 字符串;留空 = 永久
  @IsOptional() @IsString()
  expiredAt?: string;

  // 可选:绑定到某 GoEdge server(域名维度);本 Step 不用,默认 0
  @IsOptional() @IsInt() @Min(0)
  serverId?: number;
}

// POST /internal/edge/blocks/release — saas-svc 调
export class ReleaseBlockDto {
  // 二选一:ipItemId 优先
  @IsOptional() @IsInt() @Min(1)
  ipItemId?: number;

  @IsOptional() @IsInt() @Min(1)
  ipListId?: number;

  @IsOptional() @IsString() @MaxLength(64)
  value?: string;
}

export type AddBlockResult = {
  ipItemId: number;
  ipListId: number;
};
