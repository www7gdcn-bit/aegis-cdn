#!/usr/bin/env node
/**
 * sdk-call-create.cjs — 用 SDK 客户端直接调 createUser(mock server 或真 EdgeAPI 都可)。
 *
 * 验证子链路:SDK → mock server,不经 bff-edge HTTP 层。
 *
 * 用法:
 *   ADMIN_NODE_ID=test-nodeid ADMIN_NODE_SECRET=test-secret \
 *     EDGE_API_GRPC_ADDR=127.0.0.1:18003 \
 *     node sdk-call-create.cjs [username]
 *
 * 默认 username = "mock-test-${Date.now()}",每次自动唯一。
 */
const path = require("path");
const { createEdgeApiClient } = require(path.resolve(__dirname, "..", "..", "dist"));

async function main() {
  const client = createEdgeApiClient({
    addr: process.env.EDGE_API_GRPC_ADDR || "127.0.0.1:18003",
    adminNodeId: process.env.ADMIN_NODE_ID || "test-nodeid",
    adminNodeSecret: process.env.ADMIN_NODE_SECRET || "test-secret",
    mode: "grpc",
  });
  console.log(`[sdk] mode=${client.mode}`);
  const username = process.argv[2] || `mock-test-${Date.now()}`;
  try {
    const u = await client.users.create({
      username,
      email: `${username}@aegis-test.local`,
      remark: "from sdk-call-create.cjs",
      source: "aegis-test",
    });
    console.log(`[sdk] OK: created edgeUserId=${u.id} username=${u.username}`);
  } catch (e) {
    console.error(`[sdk] FAIL: code=${e.code} message=${e.message}`);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}
main();
