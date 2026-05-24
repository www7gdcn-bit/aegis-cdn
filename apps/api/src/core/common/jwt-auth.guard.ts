import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

export type AuthUser = { id: number; tenantId: number | null; role: string; email: string };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const auth: string = req.headers["authorization"] || "";
    const [scheme, token] = auth.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new UnauthorizedException("missing bearer token");
    }
    try {
      const payload = await this.jwt.verifyAsync(token);
      req.user = {
        id: Number(payload.sub),
        tenantId: payload.tenantId ?? null,
        role: payload.role,
        email: payload.email,
      } as AuthUser;
      return true;
    } catch {
      throw new UnauthorizedException("invalid token");
    }
  }
}
