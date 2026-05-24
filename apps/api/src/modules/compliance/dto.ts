import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class ReviewDto {
  @IsIn(["approve", "reject"]) action!: "approve" | "reject";
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
}

export class CreateBlockDto {
  @IsIn(["ip", "domain"]) type!: "ip" | "domain";
  @IsString() @MaxLength(253) value!: string;
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
}
