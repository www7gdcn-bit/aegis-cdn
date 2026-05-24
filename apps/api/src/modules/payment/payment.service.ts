import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../../core/prisma/prisma.service";
import { BillingService } from "../billing/billing.service";
import { PaymentRegistry } from "./provider.registry";
import { GatewayConfig, PaymentStatus } from "./provider.interface";
import { CreatePaymentDto } from "./dto";

// 支付状态机:允许的状态迁移
const TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ["paid", "failed", "expired"],
  paid: ["refunded"],
  failed: [],
  expired: [],
  refunded: [],
};

// 默认网关(后台可配置;mock 默认启用以便联调,真实网关默认禁用待填商户信息)
const DEFAULT_GATEWAYS = [
  { code: "mock", name: "模拟支付(沙盒)", enabled: true, sandbox: true, sortOrder: 1, icon: "🧪" },
  { code: "alipay", name: "支付宝", enabled: false, sandbox: true, sortOrder: 10, icon: "💙", currencies: "CNY" },
  { code: "wechat", name: "微信支付", enabled: false, sandbox: true, sortOrder: 11, icon: "💚", currencies: "CNY" },
  { code: "qqpay", name: "QQ钱包", enabled: false, sandbox: true, sortOrder: 12, icon: "🐧", currencies: "CNY" },
  { code: "stripe", name: "Stripe(信用卡)", enabled: false, sandbox: true, sortOrder: 20, icon: "💳", currencies: "USD,EUR,CNY" },
  { code: "paypal", name: "PayPal", enabled: false, sandbox: true, sortOrder: 21, icon: "🅿️", currencies: "USD,EUR" },
  { code: "crypto", name: "加密货币", enabled: false, sandbox: true, sortOrder: 30, icon: "🪙", currencies: "USDT" },
];

@Injectable()
export class PaymentService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private registry: PaymentRegistry,
    private billing: BillingService,
  ) {}

  async onModuleInit() {
    try {
      for (const g of DEFAULT_GATEWAYS) {
        await this.prisma.paymentGateway.upsert({
          where: { code: g.code },
          create: g as any,
          update: {}, // 已存在则不覆盖管理员的配置
        });
      }
    } catch { /* 表未建好时忽略 */ }
  }

  private apiBase() { return process.env.PUBLIC_API_URL || "http://localhost:4000/api/v1"; }
  private webBase() { return process.env.PUBLIC_WEB_URL || "http://localhost:3000"; }

  private toGatewayConfig(row: any, returnUrl?: string): GatewayConfig {
    return {
      code: row.code,
      sandbox: row.sandbox,
      config: (row.config as Record<string, any>) || {},
      notifyUrl: `${this.apiBase()}/payments/callback/${row.code}`,
      returnUrl: returnUrl || `${this.webBase()}/app/payments`,
      ipWhitelist: row.ipWhitelist ? String(row.ipWhitelist).split(",").map((s: string) => s.trim()).filter(Boolean) : undefined,
    };
  }

  private newNo(prefix: string) {
    return prefix + Date.now().toString(36).toUpperCase() + randomBytes(3).toString("hex").toUpperCase();
  }

  private async log(paymentNo: string, event: string, payload?: any, result?: string, ip?: string) {
    try { await this.prisma.paymentLog.create({ data: { paymentNo, event, payload: payload ?? undefined, result, ip } }); } catch {}
  }

  // 结账可选支付方式(已启用的网关)
  async methods() {
    const rows = await this.prisma.paymentGateway.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" } });
    return rows.map((g) => ({ code: g.code, name: g.name, icon: g.icon, currencies: g.currencies, sandbox: g.sandbox, feeBps: g.feeBps }));
  }

  // 创建支付单 → 调用网关下单
  async create(tenantId: number, dto: CreatePaymentDto, clientIp?: string) {
    const gw = await this.prisma.paymentGateway.findUnique({ where: { code: dto.gatewayCode } });
    if (!gw || !gw.enabled) throw new BadRequestException("该支付方式不可用");

    let amount = dto.amount || 0;
    let subject = dto.subject || "AegisCDN 充值";
    let orderId = dto.orderId;
    if (orderId) {
      const order = await this.prisma.order.findFirst({ where: { id: orderId, tenantId } });
      if (!order) throw new NotFoundException("订单不存在");
      if (order.status === "paid") throw new BadRequestException("订单已支付");
      amount = order.amount;
      subject = `AegisCDN 套餐订单 ${order.orderNo}`;
    }
    if (amount <= 0) throw new BadRequestException("金额无效");

    const fee = Math.round((amount * gw.feeBps) / 10000);
    const paymentNo = this.newNo("PAY");
    const cfg = this.toGatewayConfig(gw, dto.returnUrl);

    const payment = await this.prisma.payment.create({
      data: {
        paymentNo, tenantId, orderId, gatewayCode: gw.code, subject, amount, fee,
        currency: (gw.currencies || "CNY").split(",")[0], status: "pending",
        clientIp, expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });

    let payUrl: string | undefined;
    try {
      const r = await this.registry.get(gw.code).createOrder({
        paymentNo, amount, currency: payment.currency, subject, clientIp, gateway: cfg,
      });
      payUrl = r.payUrl;
      await this.prisma.payment.update({ where: { id: payment.id }, data: { payUrl: r.payUrl, providerTxnId: r.providerTxnId, raw: r.raw ?? undefined } });
      await this.log(paymentNo, "create", { gateway: gw.code, amount }, "ok", clientIp);
    } catch (e: any) {
      await this.log(paymentNo, "error", { stage: "create", msg: e.message }, "fail", clientIp);
      throw new BadRequestException(e.message || "下单失败");
    }

    return { paymentNo, status: "pending", gatewayCode: gw.code, amount, fee, payUrl, sandbox: gw.sandbox };
  }

  async get(tenantId: number, paymentNo: string) {
    const p = await this.prisma.payment.findUnique({ where: { paymentNo } });
    if (!p || p.tenantId !== tenantId) throw new NotFoundException("支付单不存在");
    return p;
  }

  list(tenantId: number) {
    return this.prisma.payment.findMany({ where: { tenantId }, orderBy: { id: "desc" }, take: 100 });
  }

  // 状态迁移(幂等 + 合法性校验)。返回是否实际发生迁移。
  private async transition(paymentNo: string, to: PaymentStatus, extra: Record<string, any> = {}) {
    const p = await this.prisma.payment.findUnique({ where: { paymentNo } });
    if (!p) throw new NotFoundException("支付单不存在");
    if (p.status === to) return { changed: false, payment: p };           // 幂等
    if (!TRANSITIONS[p.status as PaymentStatus]?.includes(to)) {
      throw new BadRequestException(`非法状态迁移 ${p.status} → ${to}`);
    }
    const payment = await this.prisma.payment.update({ where: { paymentNo }, data: { status: to, ...extra } });
    return { changed: true, payment };
  }

  // 标记已付 + 联动开通订阅
  private async markPaid(paymentNo: string, providerTxnId?: string) {
    const r = await this.transition(paymentNo, "paid", { paidAt: new Date(), providerTxnId });
    if (r.changed && r.payment.orderId) {
      await this.billing.fulfillOrder(r.payment.orderId, r.payment.gatewayCode);
    }
    return r;
  }

  // 网关异步回调统一入口:验签 + IP 白名单 + 幂等推进
  async handleCallback(gatewayCode: string, raw: { headers: any; rawBody: string; query: any; body: any; ip?: string }) {
    const gw = await this.prisma.paymentGateway.findUnique({ where: { code: gatewayCode } });
    if (!gw) throw new NotFoundException("网关不存在");
    const cfg = this.toGatewayConfig(gw);

    // IP 白名单(防伪造来源)
    if (cfg.ipWhitelist?.length && raw.ip && !cfg.ipWhitelist.includes(raw.ip)) {
      await this.log("-", "callback", { gateway: gatewayCode, ip: raw.ip }, "ip-rejected", raw.ip);
      throw new ForbiddenException("callback ip not allowed");
    }

    const result = await this.registry.get(gatewayCode).verifyCallback({
      gateway: cfg, headers: raw.headers, rawBody: raw.rawBody, query: raw.query, body: raw.body,
    });
    await this.log(result.paymentNo || "-", "callback", { gateway: gatewayCode, valid: result.valid, status: result.status }, result.valid ? "ok" : "invalid", raw.ip);

    if (!result.valid) throw new BadRequestException("callback verify failed"); // 防伪造回调
    if (result.paymentNo && result.status === "paid") {
      await this.markPaid(result.paymentNo, result.providerTxnId);
    } else if (result.paymentNo && result.status === "failed") {
      await this.transition(result.paymentNo, "failed").catch(() => {});
    }
    return result.ack || "success";
  }

  // 模拟支付(仅 mock 网关 / 沙盒):无需真实网关即可跑通"已支付"
  async simulatePaid(tenantId: number, paymentNo: string) {
    const p = await this.get(tenantId, paymentNo);
    const gw = await this.prisma.paymentGateway.findUnique({ where: { code: p.gatewayCode } });
    if (!gw || (gw.code !== "mock" && !gw.sandbox)) throw new BadRequestException("仅 mock/沙盒网关可模拟支付");
    await this.log(paymentNo, "simulate", null, "ok");
    await this.markPaid(paymentNo, `sim_${paymentNo}`);
    return this.get(tenantId, paymentNo);
  }

  // 退款
  async refund(paymentNo: string, reason?: string) {
    const p = await this.prisma.payment.findUnique({ where: { paymentNo } });
    if (!p) throw new NotFoundException("支付单不存在");
    if (p.status !== "paid") throw new BadRequestException("仅已支付订单可退款");
    const gw = await this.prisma.paymentGateway.findUnique({ where: { code: p.gatewayCode } });
    const refundNo = this.newNo("RF");
    const refund = await this.prisma.refund.create({ data: { refundNo, paymentNo, amount: p.amount, reason, status: "pending" } });
    try {
      const r = await this.registry.get(p.gatewayCode).refund({
        paymentNo, providerTxnId: p.providerTxnId || undefined, amount: p.amount, reason,
        gateway: this.toGatewayConfig(gw),
      });
      await this.prisma.refund.update({ where: { id: refund.id }, data: { status: r.status === "done" ? "done" : "failed", providerRefundId: r.providerRefundId } });
      if (r.status === "done") await this.transition(paymentNo, "refunded").catch(() => {});
      await this.log(paymentNo, "refund", { amount: p.amount }, r.status);
      return { refundNo, status: r.status };
    } catch (e: any) {
      await this.prisma.refund.update({ where: { id: refund.id }, data: { status: "failed" } });
      await this.log(paymentNo, "refund", { msg: e.message }, "fail");
      throw new BadRequestException(e.message || "退款失败");
    }
  }

  // ---- 管理侧:网关配置(后台热更新,勿写死)----
  adminListGateways() {
    return this.prisma.paymentGateway.findMany({ orderBy: { sortOrder: "asc" } });
  }
  async adminUpdateGateway(code: string, data: any) {
    await this.prisma.paymentGateway.update({ where: { code }, data });
    return this.prisma.paymentGateway.findUnique({ where: { code } });
  }
  adminListPayments() {
    return this.prisma.payment.findMany({ orderBy: { id: "desc" }, take: 200 });
  }
}
