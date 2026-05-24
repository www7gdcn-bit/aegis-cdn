import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { EdgeProvisionModule } from "../edge-provision/edge-provision.module";

@Module({
  imports: [EdgeProvisionModule], // register 末尾异步触发 scheduleProvision
  providers: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
