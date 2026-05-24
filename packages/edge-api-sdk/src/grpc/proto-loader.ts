import * as path from "path";
import * as protoLoader from "@grpc/proto-loader";
import * as grpc from "@grpc/grpc-js";

// proto 文件 vendored 在 SDK 顶层 proto/(由 scripts/sync-proto.sh 同步);
// dev (ts-node, __dirname=src/grpc/) 与 dist (__dirname=dist/grpc/) 都用 ../../proto 相对解析。
const PROTO_DIR = process.env.EDGE_API_PROTO_DIR || path.resolve(__dirname, "..", "..", "proto");

const LOADER_OPTIONS: protoLoader.Options = {
  keepCase: true,          // proto 用 camelCase,保留原名(GoEdge 习惯)
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [PROTO_DIR],
};

export function loadProto(relPath: string): grpc.GrpcObject {
  const fullPath = path.resolve(PROTO_DIR, relPath);
  const packageDef = protoLoader.loadSync(fullPath, LOADER_OPTIONS);
  return grpc.loadPackageDefinition(packageDef);
}
