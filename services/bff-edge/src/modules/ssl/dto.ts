import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

// POST /internal/edge/ssl/acme/tasks — saas-svc 调,一把签发(createACMETask + runACMETask)
export class RequestAcmeCertDto {
  @IsInt() @Min(1) edgeUserId!: number;
  @IsInt() @Min(1) acmeUserId!: number;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) domains!: string[];
  @IsOptional() @IsIn(["http", "dns"]) authType?: "http" | "dns";
  @IsOptional() @IsInt() @Min(0) dnsProviderId?: number;
  @IsOptional() @IsBoolean() autoRenew?: boolean;
}

export type RequestAcmeCertResult = {
  acmeTaskId: number;
  isOk: boolean;
  sslCertId?: number;
  error?: string;
};
