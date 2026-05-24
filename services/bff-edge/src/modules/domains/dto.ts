import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

// POST /internal/edge/domains — saas-svc 调
export class CreateEdgeDomainDto {
  @IsInt() @Min(1)
  tenantId!: number;

  // 必须传 saas-svc 已知的 edgeUserId(若 Tenant 还未 provision,saas-svc 应自己等)
  @IsInt() @Min(1)
  edgeUserId!: number;

  // 接入域名 + 平台分配的 CNAME target,二者都要进 GoEdge serverNames
  // 这样客户最终改 CNAME 后 GoEdge 才认识请求 Host 头
  @IsArray() @ArrayMinSize(1)
  @IsString({ each: true })
  serverNames!: string[];

  // 源站地址 — 每个带协议,例 "http://192.168.1.10:80"
  @IsArray() @ArrayMinSize(1)
  @IsString({ each: true })
  originAddrs!: string[];

  @IsOptional() @IsInt() @Min(0)
  clusterId?: number;

  @IsOptional() @IsBoolean()
  enableWebsocket?: boolean;

  @IsOptional() @IsString() @MaxLength(255)
  remark?: string;
}

export type CreateEdgeDomainResult = {
  edgeDomainId: number;
  serverNames: string[];
};
