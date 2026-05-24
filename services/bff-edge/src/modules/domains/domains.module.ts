import { Module } from "@nestjs/common";
import { DomainsController } from "./domains.controller";

@Module({ controllers: [DomainsController] })
export class DomainsModule {}
