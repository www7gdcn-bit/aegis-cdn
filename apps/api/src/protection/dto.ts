import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class UpdateCcDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsIn(["off", "normal", "attack", "strict"]) mode?: string;
  @IsOptional() @IsIn(["log", "challenge", "captcha", "block"]) action?: string;
}

export class UpdateWafDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsIn(["off", "observe", "block"]) mode?: string;
  @IsOptional() @IsString() rulesets?: string; // 逗号分隔
  @IsOptional() @IsBoolean() botProtection?: boolean;
}

export class CreateWafRuleDto {
  @IsIn(["uri", "args", "body", "ua", "cookie", "referer"]) target!: string;
  @IsIn(["regex", "contains"]) op!: string;
  @IsString() pattern!: string;
  @IsIn(["log", "challenge", "block"]) action!: string;
  @IsOptional() @IsIn(["low", "medium", "high", "critical"]) severity?: string;
}

export class CreateAclDto {
  @IsIn(["ip", "geo", "ua", "referer"]) category!: string;
  @IsIn(["allow", "deny"]) listType!: string;
  @IsString() value!: string;
}

export class CreateRateRuleDto {
  @IsIn(["ip", "uri", "cookie", "session", "ua", "asn", "country"]) dim!: string;
  @IsInt() @Min(1) @Max(86400) window!: number;
  @IsInt() @Min(1) limit!: number;
  @IsOptional() @IsIn(["sliding", "token", "leaky"]) algo?: string;
}
