import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreatePaymentDto {
  @IsString() gatewayCode!: string;
  @IsOptional() @IsInt() orderId?: number;       // 关联 billing 订阅订单
  @IsOptional() @IsInt() @Min(1) amount?: number; // 无 orderId 时直接指定金额(元)
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() returnUrl?: string;
}

export class RefundDto {
  @IsOptional() @IsString() reason?: string;
}

export class UpdateGatewayDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() sandbox?: boolean;
  @IsOptional() config?: Record<string, any>;
  @IsOptional() @IsInt() feeBps?: number;
  @IsOptional() @IsNumber() exchangeRate?: number;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsString() currencies?: string;
  @IsOptional() @IsString() ipWhitelist?: string;
}
