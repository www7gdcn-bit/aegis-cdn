import { Module } from "@nestjs/common";
import { SslController } from "./ssl.controller";

@Module({ controllers: [SslController] })
export class SslModule {}
