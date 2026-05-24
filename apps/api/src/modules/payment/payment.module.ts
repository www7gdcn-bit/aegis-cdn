import { Module } from "@nestjs/common";
import { PAYMENT_PROVIDERS } from "./provider.interface";
import { PaymentRegistry } from "./provider.registry";
import { PaymentService } from "./payment.service";
import { PaymentController } from "./payment.controller";
import { CallbackController } from "./callback.controller";
import { AdminPaymentController, AdminPaymentsController } from "./admin-payment.controller";
import { BillingModule } from "../billing/billing.module";

// 支付适配器 —— 新增网关只需在此处加一行 multi provider,核心代码无需改动。
import { MockProvider } from "./providers/mock.provider";
import { AlipayProvider } from "./providers/alipay.provider";
import { WechatPayProvider } from "./providers/wechat.provider";
import { QQPayProvider } from "./providers/qqpay.provider";
import { StripeProvider } from "./providers/stripe.provider";
import { PaypalProvider } from "./providers/paypal.provider";
import { CryptoProvider } from "./providers/crypto.provider";

const providerEntries = [
  MockProvider, AlipayProvider, WechatPayProvider, QQPayProvider,
  StripeProvider, PaypalProvider, CryptoProvider,
].map((useClass) => ({ provide: PAYMENT_PROVIDERS, useClass, multi: true }));

@Module({
  imports: [BillingModule], // 支付成功联动开通订阅
  providers: [PaymentRegistry, PaymentService, ...providerEntries],
  controllers: [PaymentController, CallbackController, AdminPaymentController, AdminPaymentsController],
})
export class PaymentModule {}
