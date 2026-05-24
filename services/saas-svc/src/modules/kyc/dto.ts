import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class SubmitKycDto {
  @IsString() @MaxLength(128) companyName!: string;
  @IsString() @MaxLength(64) licenseNo!: string;       // 营业执照/统一社会信用代码
  @IsString() @MaxLength(64) legalPerson!: string;
  @IsString() @MaxLength(64) contactName!: string;
  @IsString() @MaxLength(32) contactPhone!: string;
  @IsOptional() @IsString() @MaxLength(64) industry?: string;
}

export class ReviewKycDto {
  @IsIn(["approve", "reject"]) action!: "approve" | "reject";
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
}
