#!/usr/bin/env node
/**
 * gen-token.cjs — 用 SDK buildGoEdgeToken 生成 token,输出 {secret,nodeId,token} JSON 到 stdout。
 *
 * 用法:
 *   node gen-token.cjs                                 (用默认 secret/nodeId)
 *   node gen-token.cjs <secret> <nodeId>
 *   node gen-token.cjs <secret> <nodeId> | go run .    (送入 decrypt-token.go)
 *
 * 注:从仓库根或本目录跑均可(用 require 解析 dist)。
 */
const path = require("path");
const { buildGoEdgeToken } = require(path.resolve(__dirname, "..", "..", "dist"));

const secret =
  process.argv[2] || "aegis-test-secret-abcdefghij1234567890ABCDEF"; // 32+ chars 不需要 padding
const nodeId = process.argv[3] || "aegis-test-nodeid-aBcDeF"; // > 16 chars

const token = buildGoEdgeToken(secret, nodeId, "admin");

process.stdout.write(JSON.stringify({ secret, nodeId, token }));
