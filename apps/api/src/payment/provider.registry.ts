import { Inject, Injectable } from "@nestjs/common";
import { PAYMENT_PROVIDERS, PaymentProvider } from "./provider.interface";

// 按 code 索引所有已注册的支付适配器。新增网关只需在 module 注册 multi provider,本类无需改动。
@Injectable()
export class PaymentRegistry {
  private readonly map = new Map<string, PaymentProvider>();

  constructor(@Inject(PAYMENT_PROVIDERS) providers: PaymentProvider[]) {
    for (const p of providers) this.map.set(p.code, p);
  }

  get(code: string): PaymentProvider {
    const p = this.map.get(code);
    if (!p) throw new Error(`未知支付网关: ${code}`);
    return p;
  }

  codes(): string[] {
    return [...this.map.keys()];
  }
}
