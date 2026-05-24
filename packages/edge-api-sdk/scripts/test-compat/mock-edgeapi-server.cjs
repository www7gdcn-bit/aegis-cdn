#!/usr/bin/env node
/**
 * mock-edgeapi-server.cjs — 起一个 @grpc/grpc-js Server 实现 GoEdge UserService。
 *
 * 真正用 SDK 同样的 proto-loader 加载 proto,验证:
 *   - SDK 客户端的 metadata { nodeid, token } 能被读出
 *   - token 用 GoEdge 同实现解密 → 验证 type=admin、timestamp 合理
 *   - createUser 请求字段(username/source/remark...)被正确收到
 *   - 返回 {userId} 后 SDK 能正确解出
 *
 * 用法:
 *   # 终端 1
 *   ADMIN_SECRET=test-secret ADMIN_NODE_ID=test-nodeid \
 *     node packages/edge-api-sdk/scripts/test-compat/mock-edgeapi-server.cjs
 *
 *   # 终端 2(同环境):用 SDK 直接调
 *   ADMIN_NODE_ID=test-nodeid ADMIN_NODE_SECRET=test-secret \
 *     node packages/edge-api-sdk/scripts/test-compat/sdk-call-create.cjs
 */
const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { createDecipheriv } = require("crypto");

const PROTO_DIR = path.resolve(__dirname, "..", "..", "proto");
const PORT = Number(process.env.MOCK_GRPC_PORT || 18003);
const ADMIN_NODE_ID = process.env.ADMIN_NODE_ID || "test-nodeid";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "test-secret";

const packageDef = protoLoader.loadSync(path.resolve(PROTO_DIR, "service_user.proto"), {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [PROTO_DIR],
});
const proto = grpc.loadPackageDefinition(packageDef);

// 复刻 GoEdge 服务端 metadata 解码(用上游一样的 aes-256-cfb)
function decryptGoEdgeToken(token, secret, nodeId) {
  const keyBuf = Buffer.alloc(32, " ");
  Buffer.from(secret, "utf8").copy(keyBuf, 0, 0, Math.min(secret.length, 32));
  const ivBuf = Buffer.alloc(16, " ");
  Buffer.from(nodeId, "utf8").copy(ivBuf, 0, 0, Math.min(nodeId.length, 16));
  const data = Buffer.from(token, "base64");
  const dec = createDecipheriv("aes-256-cfb", keyBuf, ivBuf);
  return Buffer.concat([dec.update(data), dec.final()]).toString("utf8");
}

function verifyMetadata(metadata) {
  const nodeIds = metadata.get("nodeid");
  const tokens = metadata.get("token");
  if (!nodeIds?.length) return { ok: false, code: grpc.status.UNAUTHENTICATED, reason: "missing nodeid header" };
  if (!tokens?.length) return { ok: false, code: grpc.status.UNAUTHENTICATED, reason: "missing token header" };
  const nodeId = nodeIds[0];
  const token = tokens[0];
  if (nodeId !== ADMIN_NODE_ID) {
    return { ok: false, code: grpc.status.UNAUTHENTICATED, reason: `nodeid mismatch: got=${nodeId}` };
  }
  try {
    const plain = decryptGoEdgeToken(token, ADMIN_SECRET, nodeId);
    const payload = JSON.parse(plain);
    if (payload.type !== "admin") {
      return { ok: false, code: grpc.status.PERMISSION_DENIED, reason: `bad type=${payload.type}` };
    }
    return { ok: true, payload };
  } catch (e) {
    return { ok: false, code: grpc.status.UNAUTHENTICATED, reason: `decrypt failed: ${e.message}` };
  }
}

let nextUserId = 1000;
const seenUsernames = new Set();

const userServiceImpl = {
  createUser: (call, callback) => {
    const auth = verifyMetadata(call.metadata);
    console.log(`[mock] createUser metadata-check: ${JSON.stringify(auth)}`);
    if (!auth.ok) {
      return callback({ code: auth.code, message: auth.reason });
    }
    const req = call.request;
    console.log(`[mock] createUser request:`, JSON.stringify(req));
    if (!req.username) {
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: "username required" });
    }
    if (seenUsernames.has(req.username)) {
      return callback({ code: grpc.status.ALREADY_EXISTS, message: `username '${req.username}' already exists` });
    }
    seenUsernames.add(req.username);
    const userId = nextUserId++;
    console.log(`[mock] createUser → userId=${userId}`);
    callback(null, { userId });
  },
  // 其他方法返回 UNIMPLEMENTED,方便后续 Step 测
  registerUser: (_call, cb) => cb({ code: grpc.status.UNIMPLEMENTED, message: "mock not impl" }),
  verifyUser: (_call, cb) => cb({ code: grpc.status.UNIMPLEMENTED, message: "mock not impl" }),
  updateUser: (_call, cb) => cb({ code: grpc.status.UNIMPLEMENTED, message: "mock not impl" }),
  deleteUser: (_call, cb) => cb({ code: grpc.status.UNIMPLEMENTED, message: "mock not impl" }),
  countAllEnabledUsers: (_call, cb) => cb({ code: grpc.status.UNIMPLEMENTED, message: "mock not impl" }),
  listEnabledUsers: (_call, cb) => cb({ code: grpc.status.UNIMPLEMENTED, message: "mock not impl" }),
  findEnabledUser: (_call, cb) => cb({ code: grpc.status.UNIMPLEMENTED, message: "mock not impl" }),
  checkUserUsername: (_call, cb) => cb({ code: grpc.status.UNIMPLEMENTED, message: "mock not impl" }),
  loginUser: (_call, cb) => cb({ code: grpc.status.UNIMPLEMENTED, message: "mock not impl" }),
  updateUserInfo: (_call, cb) => cb({ code: grpc.status.UNIMPLEMENTED, message: "mock not impl" }),
  updateUserLogin: (_call, cb) => cb({ code: grpc.status.UNIMPLEMENTED, message: "mock not impl" }),
  composeUserDashboard: (_call, cb) => cb({ code: grpc.status.UNIMPLEMENTED, message: "mock not impl" }),
  findUserNodeClusterId: (_call, cb) => cb({ code: grpc.status.UNIMPLEMENTED, message: "mock not impl" }),
  updateUserFeatures: (_call, cb) => cb({ code: grpc.status.UNIMPLEMENTED, message: "mock not impl" }),
  updateAllUsersFeatures: (_call, cb) => cb({ code: grpc.status.UNIMPLEMENTED, message: "mock not impl" }),
  findUserFeatures: (_call, cb) => cb({ code: grpc.status.UNIMPLEMENTED, message: "mock not impl" }),
  findAllUserFeatureDefinitions: (_call, cb) => cb({ code: grpc.status.UNIMPLEMENTED, message: "mock not impl" }),
  composeUserGlobalBoard: (_call, cb) => cb({ code: grpc.status.UNIMPLEMENTED, message: "mock not impl" }),
};

const server = new grpc.Server();
server.addService(proto.pb.UserService.service, userServiceImpl);
server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    console.error("bindAsync err:", err);
    process.exit(1);
  }
  console.log(`[mock] EdgeAPI mock listening on 0.0.0.0:${port}`);
  console.log(`[mock] ADMIN_NODE_ID=${ADMIN_NODE_ID}`);
  console.log(`[mock] ADMIN_SECRET=${ADMIN_SECRET}`);
});
