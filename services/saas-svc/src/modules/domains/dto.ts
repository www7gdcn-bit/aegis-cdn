import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

// 域名格式:简化校验 — 至少含一个点,允许 a-z 0-9 - . *(通配符前置)
// 详细 RFC 校验 Step 4 不做,后续可加 isFQDN。
const DOMAIN_RE = /^(?:\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export class AddDomainDto {
  @IsString() @MaxLength(253)
  @Matches(DOMAIN_RE, { message: "domain 格式不合法" })
  domain!: string;

  // 源站,例 "192.168.1.10:80" 或 "origin.example.com"。
  // saas-svc 内部会前缀 http:// 后传给 GoEdge(GoEdge 要求带协议)
  @IsOptional() @IsString() @MaxLength(255)
  originHost?: string;
}
