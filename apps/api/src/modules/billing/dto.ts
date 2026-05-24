import { IsIn, IsString } from "class-validator";

export class CreateOrderDto {
  @IsString()
  planCode!: string;

  @IsIn(["monthly", "yearly"])
  cycle!: "monthly" | "yearly";
}
