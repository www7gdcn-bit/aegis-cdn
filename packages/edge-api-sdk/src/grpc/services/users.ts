import * as grpc from "@grpc/grpc-js";
import type { UsersService } from "../../services/users";
import type { CreateUserInput, EdgeUserId, UserSummary } from "../../types";
import { EdgeApiError, NotImplementedError } from "../../errors";

// GoEdge UserService.createUser 的实现。
// proto: upstream/EdgeCommon/pkg/rpc/protos/service_user.proto
//   rpc createUser (CreateUserRequest) returns (CreateUserResponse);
//   CreateUserRequest:
//     string username, password, fullname, mobile, tel, email, remark, source;
//     int64 nodeClusterId;
//   CreateUserResponse:
//     int64 userId;

export class GrpcUsersService implements UsersService {
  constructor(
    private stub: any,                            // grpc-js Client(由 GrpcEdgeApiClient 注入)
    private metadata: () => grpc.Metadata,        // 每次调用前重新生成(token 带 timestamp)
  ) {}

  async create(input: CreateUserInput): Promise<UserSummary> {
    if (!input.username) throw new EdgeApiError("CreateUserInput.username required");

    const req = {
      username: input.username,
      password: "",                                // SaaS 接管登录,GoEdge 侧无需明文密码
      fullname: input.fullname || "",
      mobile: input.mobile || "",
      tel: "",
      email: input.email || "",
      remark: input.remark || "managed by aegis-saas",
      source: input.source || "aegis-saas",
      nodeClusterId: 0,                            // 0 = 平台默认集群(GoEdge 会自动选)
    };

    return new Promise<UserSummary>((resolve, reject) => {
      this.stub.createUser(req, this.metadata(), (err: grpc.ServiceError | null, res: any) => {
        if (err) {
          return reject(new EdgeApiError(`UserService.createUser failed: ${err.message}`, err.code != null ? String(err.code) : undefined, err));
        }
        const id = Number(res?.userId ?? 0);
        if (!id) return reject(new EdgeApiError("UserService.createUser returned empty userId"));
        resolve({ id, username: input.username, email: input.email });
      });
    });
  }

  async findById(_id: EdgeUserId): Promise<UserSummary | null> {
    throw new NotImplementedError("GrpcUsersService.findById (Phase 3 Step 3+)");
  }
  async disable(_id: EdgeUserId): Promise<void> {
    throw new NotImplementedError("GrpcUsersService.disable (Phase 3 Step 3+)");
  }
  async enable(_id: EdgeUserId): Promise<void> {
    throw new NotImplementedError("GrpcUsersService.enable (Phase 3 Step 3+)");
  }
}
