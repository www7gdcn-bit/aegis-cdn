import { Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";
import {
  CallbackInput, CallbackResult, CreateOrderInput, CreateOrderResult,
  PaymentProvider, QueryInput, QueryResult, RefundInput, RefundResult,
} from "../provider.interface";

// Stripe:基于官方 REST API + Webhook 签名(HMAC-SHA256),逻辑真实。
// 后台配置:config.secretKey(sk_...)、config.webhookSecret(whsec_...)。填好即用。
@Injectable()
export class StripeProvider implements PaymentProvider {
  readonly code = "stripe";

  private apiBase() { return "https://api.stripe.com/v1"; }

  private secretKey(g: { config: Record<string, any> }) {
    const k = g.config?.secretKey;
    if (!k) throw new Error("请在后台配置 Stripe secretKey 后启用");
    return k;
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const sk = this.secretKey(input.gateway);
    // Stripe 金额用最小货币单位(分)
    const unitAmount = Math.round(input.amount * 100);
    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("success_url", (input.gateway.returnUrl || "") + "?paid=1");
    form.set("cancel_url", (input.gateway.returnUrl || "") + "?canceled=1");
    form.set("client_reference_id", input.paymentNo);
    form.set("metadata[paymentNo]", input.paymentNo);
    form.set("line_items[0][quantity]", "1");
    form.set("line_items[0][price_data][currency]", input.currency.toLowerCase());
    form.set("line_items[0][price_data][unit_amount]", String(unitAmount));
    form.set("line_items[0][price_data][product_data][name]", input.subject);

    const res = await fetch(`${this.apiBase()}/checkout/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sk}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(`Stripe 下单失败: ${data?.error?.message || res.status}`);
    return { payUrl: data.url, providerTxnId: data.id, raw: data };
  }

  async queryOrder(input: QueryInput): Promise<QueryResult> {
    if (!input.providerTxnId) return { status: "pending" };
    const sk = this.secretKey(input.gateway);
    const res = await fetch(`${this.apiBase()}/checkout/sessions/${input.providerTxnId}`, {
      headers: { Authorization: `Bearer ${sk}` },
    });
    const data: any = await res.json();
    const paid = data.payment_status === "paid";
    return { status: paid ? "paid" : "pending", providerTxnId: input.providerTxnId, raw: data };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const sk = this.secretKey(input.gateway);
    const form = new URLSearchParams();
    if (input.providerTxnId) form.set("payment_intent", input.providerTxnId);
    form.set("amount", String(Math.round(input.amount * 100)));
    const res = await fetch(`${this.apiBase()}/refunds`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sk}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const data: any = await res.json();
    return { status: res.ok ? "done" : "failed", providerRefundId: data?.id, raw: data };
  }

  // Stripe Webhook 签名校验:Stripe-Signature: t=...,v1=...  → HMAC-SHA256(`${t}.${rawBody}`, whsec)
  async verifyCallback(input: CallbackInput): Promise<CallbackResult> {
    const whsec = input.gateway.config?.webhookSecret;
    const sigHeader: string = input.headers["stripe-signature"] || "";
    if (!whsec || !sigHeader) return { valid: false };
    const parts = Object.fromEntries(sigHeader.split(",").map((kv) => kv.split("=")));
    const t = parts["t"]; const v1 = parts["v1"];
    if (!t || !v1) return { valid: false };
    const expected = createHmac("sha256", whsec).update(`${t}.${input.rawBody}`).digest("hex");
    let ok = false;
    try { ok = timingSafeEqual(Buffer.from(expected), Buffer.from(v1)); } catch { ok = false; }
    if (!ok) return { valid: false };

    const event = input.body;
    if (event?.type === "checkout.session.completed") {
      const session = event.data?.object || {};
      const paymentNo = session.metadata?.paymentNo || session.client_reference_id;
      return { valid: true, paymentNo, status: "paid", providerTxnId: session.payment_intent || session.id, ack: "ok" };
    }
    // 其他事件:验签通过但不改单状态
    return { valid: true, ack: "ok" };
  }
}
