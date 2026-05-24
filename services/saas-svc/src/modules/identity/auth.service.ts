import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../core/prisma/prisma.service";
import { LoginDto, RegisterDto } from "./dto";

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  private async sign(user: {
    id: number;
    tenantId: number | null;
    role: string;
    email: string;
    edgeUserId?: number | null;
  }) {
    const token = await this.jwt.signAsync({
      sub: String(user.id),
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      // Phase 3 后,Tenant.edgeUserId 被 bff-edge 写入;放进 JWT 减少跨服务往返
      edgeUserId: user.edgeUserId ?? null,
    });
    return { access_token: token, user };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException("email already registered");

    // 首个注册用户成为平台管理员;否则为租户管理员(user)
    const userCount = await this.prisma.user.count();
    const role = userCount === 0 ? "admin" : "user";

    const tenant = await this.prisma.tenant.create({ data: { name: dto.tenantName } });
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        tenantId: tenant.id,
        role,
      },
    });
    // Phase 2 阶段 tenant.edgeUserId 为 null(bff-edge 尚未上线);
    // Phase 3 起 saas-svc 在此处异步 POST bff-edge /internal/user/provision 同步创建 GoEdge user
    return this.sign({
      id: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      edgeUserId: tenant.edgeUserId,
    });
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { tenant: { select: { edgeUserId: true } } },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("邮箱或密码错误");
    }
    if (!user.isActive) throw new UnauthorizedException("账号已被禁用");
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.sign({
      id: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      edgeUserId: user.tenant?.edgeUserId ?? null,
    });
  }

  async me(userId: number) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        tenantId: true,
        name: true,
        createdAt: true,
        tenant: { select: { name: true, edgeUserId: true, kycStatus: true } },
      },
    });
    return u;
  }
}
