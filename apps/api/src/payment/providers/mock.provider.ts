import { Injectable } from "@nestjs/common";
import { createHmac } from "crypto";
import {
  CallbackInput, CallbackResult, CreateOrderInput, CreateOrderResult,
  PaymentProvider, QueryInput, QueryResult, RefundInput, RefundResult,
} from "../provider.interface";

// Mock 网关:无需任何商户配置即可完整跑通"下单 → 支付 → 回调 → 退款"全流程。
// 用于本地/沙盒联调;真实网关接入后可在后台禁用。
@Injectable()
export class MockProvider implements PaymentProvider {
  readonly code = "mock";

  private secret(input: { gateway: { config: Record<string, any> } }) {
    return input.gateway.config?.secret || "mock-secret";
  }

  // 计算 mock 签名(回调防伪造演示)
  sign(paymentNo: string, status: string, secret: string) {
    return createHmac("sha256", secret).update(`${paymentNo}|${status}`).digest("hex");
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    // 真实网关此处返回收银台 URL;mock 由前端"模拟支付"按钮触发回调
    return { providerTxnId: `mock_${input.paymentNo}`, raw: { sandbox: true } };
  }

  async queryOrder(_input: QueryInput): Promise<QueryResult> {
    return { status: "pending" }; // 真实状态以平台 DB 为准(mock 由模拟回调推进)
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    return { status: "done", providerRefundId: `mockref_${input.paymentNo}` };
  }

  // 校验 mock 回调签名(防伪造)
  async verifyCallback(input: CallbackInput): Promise<CallbackResult> {
    const { paymentNo, status, sign } = input.body || {};
    if (!paymentNo || !status) return { valid: false };
    const expect = this.sign(paymentNo, status, this.secret(input));
    return {
      valid: sign === expect,
      paymentNo,
      status,
      providerTxnId: `mock_${paymentNo}`,
      ack: "success",
    };
  }
}
