// 支付网关适配器统一契约。新增支付方式 = 实现本接口 + 在 module providers 注册一行,
// 核心 PaymentService 无需改动。

export type PaymentStatus = "pending" | "paid" | "failed" | "expired" | "refunded";

// 注入令牌:所有 Provider 以 multi 方式注册到这个数组,Registry 据此构建 code→provider 映射
export const PAYMENT_PROVIDERS = Symbol("PAYMENT_PROVIDERS");

// 单个网关的运行时配置(来自 DB PaymentGateway,后台可配置/热更新)
export interface GatewayConfig {
  code: string;
  sandbox: boolean;
  config: Record<string, any>; // merchantId/appId/apiKey/secret/publicKey/webhookSecret...
  notifyUrl: string;           // 平台异步回调地址
  returnUrl?: string;          // 用户支付后跳回地址
  ipWhitelist?: string[];
}

export interface CreateOrderInput {
  paymentNo: string;
  amount: number;   // 元
  currency: string;
  subject: string;
  clientIp?: string;
  gateway: GatewayConfig;
}
export interface CreateOrderResult {
  payUrl?: string;       // 收银台跳转地址(real 网关)
  qrCode?: string;       // 扫码支付二维码内容
  providerTxnId?: string;
  raw?: any;
}

export interface QueryInput {
  paymentNo: string;
  providerTxnId?: string;
  gateway: GatewayConfig;
}
export interface QueryResult {
  status: PaymentStatus;
  providerTxnId?: string;
  raw?: any;
}

export interface RefundInput {
  paymentNo: string;
  providerTxnId?: string;
  amount: number;
  reason?: string;
  gateway: GatewayConfig;
}
export interface RefundResult {
  status: "pending" | "done" | "failed";
  providerRefundId?: string;
  raw?: any;
}

export interface CallbackInput {
  gateway: GatewayConfig;
  headers: Record<string, any>;
  rawBody: string;
  query: Record<string, any>;
  body: any;
}
export interface CallbackResult {
  valid: boolean;             // 签名/来源校验是否通过
  paymentNo?: string;
  status?: PaymentStatus;
  providerTxnId?: string;
  // 网关要求的同步响应体(如支付宝需返回 "success",微信需返回特定 JSON)
  ack?: string;
}

export interface PaymentProvider {
  readonly code: string;
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  queryOrder(input: QueryInput): Promise<QueryResult>;
  refund(input: RefundInput): Promise<RefundResult>;
  verifyCallback(input: CallbackInput): Promise<CallbackResult>;
}
