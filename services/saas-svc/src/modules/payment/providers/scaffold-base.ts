import {
  CallbackInput, CallbackResult, CreateOrderInput, CreateOrderResult,
  PaymentProvider, QueryInput, QueryResult, RefundInput, RefundResult,
} from "../provider.interface";

// 真实网关适配器脚手架:接口与注册已就绪,后台配置就绪后,补全各自 SDK/签名逻辑即可启用。
// 安全默认:verifyCallback 在未实现签名前一律拒绝(valid:false),杜绝伪造回调。
export abstract class ScaffoldProvider implements PaymentProvider {
  abstract readonly code: string;
  abstract readonly displayName: string;
  protected abstract requiredKeys: string[];

  protected ensure(g: { config: Record<string, any> }) {
    for (const k of this.requiredKeys) {
      if (!g.config?.[k]) throw new Error(`请在后台配置「${this.displayName}」的 ${k} 后启用`);
    }
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    this.ensure(input.gateway);
    throw new Error(`${this.displayName} 适配器待接入支付 SDK(配置已就绪,实现 createOrder 即可启用)`);
  }
  async queryOrder(input: QueryInput): Promise<QueryResult> {
    this.ensure(input.gateway);
    throw new Error(`${this.displayName} queryOrder 待接入`);
  }
  async refund(input: RefundInput): Promise<RefundResult> {
    this.ensure(input.gateway);
    throw new Error(`${this.displayName} refund 待接入`);
  }
  async verifyCallback(_input: CallbackInput): Promise<CallbackResult> {
    return { valid: false }; // 未实现真实签名校验前,拒绝一切回调(安全默认)
  }
}
