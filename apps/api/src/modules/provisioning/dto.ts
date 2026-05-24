import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class CreateDomainDto {
  @IsString()
  @Matches(/^([a-z0-9-]+\.)+[a-z]{2,}$/i, { message: "无效域名" })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(253)
  originAddress?: string;
}

export class UpdateDomainDto {
  @IsOptional() @IsString() protocol?: string;
  @IsOptional() status?: string;
}
