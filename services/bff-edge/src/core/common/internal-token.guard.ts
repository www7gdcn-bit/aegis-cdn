import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "crypto";

// 所有 /internal/edge/* 端点的入口守卫:
// 校验 X-Aegis-Internal-Token header 与 process.env.AEGIS_INTERNAL_SECRET 是否一致。
// 与 saas-svc 共享密钥;timingSafeEqual 防时序攻击。
@Injectable()
export class InternalTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const provided: string = req.headers["x-aegis-internal-token"] || "";
    const expected = process.env.AEGIS_INTERNAL_SECRET || "";
    if (!expected) {
      throw new UnauthorizedException("AEGIS_INTERNAL_SECRET not configured");
    }
    if (provided.length !== expected.length) {
      throw new UnauthorizedException("invalid internal token");
    }
    let ok = false;
    try {
      ok = timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    } catch {
      ok = false;
    }
    if (!ok) throw new UnauthorizedException("invalid internal token");
    return true;
  }
}
