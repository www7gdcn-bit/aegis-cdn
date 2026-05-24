import { Module } from "@nestjs/common";
import { GlobalBlocksService } from "./globalblocks.service";
import { GlobalBlocksController } from "./globalblocks.controller";
import { AdminGlobalBlocksController } from "./admin-globalblocks.controller";

@Module({
  providers: [GlobalBlocksService],
  controllers: [GlobalBlocksController, AdminGlobalBlocksController],
  exports: [GlobalBlocksService],
})
export class GlobalBlocksModule {}
