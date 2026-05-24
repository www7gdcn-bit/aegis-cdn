import { IsIn, IsInt, IsOptional, Min } from "class-validator";
import type { Features } from "../plans/plans.service";

// /internal/quota/check — bff-edge 问 saas-svc:"租户 X 能否做动作 Y"
export class QuotaCheckDto {
  @IsInt() tenantId!: number;

  @IsIn(["add_domain", "use_feature"])
  action!: "add_domain" | "use_feature";

  // action=add_domain 时需要传当前域名计数(bff-edge 调 EdgeAPI 拿)
  @IsOptional() @IsInt() @Min(0)
  currentDomainCount?: number;

  // action=use_feature 时需要传 feature key
  @IsOptional()
  feature?: keyof Features;

  @IsOptional()
  featureLabel?: string;
}

export type QuotaCheckResult = {
  allowed: boolean;
  reason?: string;       // allowed=false 时人可读的拒绝理由(可直接 toast)
  status?: number;       // 推荐 HTTP status(402 表示需升级套餐)
  plan?: string;
  domainLimit?: number;
};

// /internal/user/provision — bff-edge 通知"已建 GoEdge user,回写 edgeUserId"
export class UserProvisionDto {
  @IsInt() tenantId!: number;
  @IsInt() edgeUserId!: number;
}

// /internal/user/disable — bff-edge 通知"saas-svc 已欠费/封禁,关闭对应 servers"
// 当前 Phase 2 仅占位,真正动作 Phase 3 由 bff-edge 实施;saas-svc 这里只记 status
export class UserDisableDto {
  @IsInt() tenantId!: number;
  @IsOptional() reason?: string;
}
