import { NotImplementedError } from "../errors";
import type { CreateUserInput, EdgeUserId, UserSummary } from "../types";

// GoEdge UserService(EdgeCommon/pkg/rpc/protos/service_user.proto)的子集代理。
// Phase 3 Step 1 全为 placeholder;Step 2+ 真接 gRPC client。
export interface UsersService {
  create(input: CreateUserInput): Promise<UserSummary>;
  findById(id: EdgeUserId): Promise<UserSummary | null>;
  disable(id: EdgeUserId): Promise<void>;
  enable(id: EdgeUserId): Promise<void>;
}

export class PlaceholderUsersService implements UsersService {
  async create(_input: CreateUserInput): Promise<UserSummary> {
    throw new NotImplementedError("UsersService.create");
  }
  async findById(_id: EdgeUserId): Promise<UserSummary | null> {
    throw new NotImplementedError("UsersService.findById");
  }
  async disable(_id: EdgeUserId): Promise<void> {
    throw new NotImplementedError("UsersService.disable");
  }
  async enable(_id: EdgeUserId): Promise<void> {
    throw new NotImplementedError("UsersService.enable");
  }
}
