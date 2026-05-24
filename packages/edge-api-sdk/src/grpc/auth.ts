import { createCipheriv } from "crypto";

/**
 * 复刻 GoEdge gRPC 鉴权 token 生成。
 *
 * 上游实现:upstream/EdgeAPI/internal/rpc/utils/utils_ext.go(metadata 解析)
 * 加密算法:upstream/EdgeAPI/internal/encrypt/method_aes_256_cfb.go
 *   - AES-256-CFB
 *   - key  = secret 字符串,若 <32 byte 补空格,若 >32 byte 截断
 *   - iv   = nodeId 字符串,若 <16 byte 补空格,若 >16 byte 截断
 *   - 明文 = JSON `{type, timestamp, userId}`
 *   - 输出 = base64(ciphertext)
 *
 * 服务端验证流程:
 *   1. metadata 头 nodeid → 查 apiTokens 表得 secret
 *   2. metadata 头 token  → base64 decode → aes-256-cfb decrypt(key=secret, iv=nodeid)
 *   3. JSON.parse → 校验 type 是否在允许列表
 *
 * Phase 3 Step 2 风险:Node 的 'aes-256-cfb' 对应 CFB-128(每次 128bit feedback),
 * Go 的 cipher.NewCFBEncrypter 也是 128-bit CFB(默认),理论上互通,但**未端到端实测**。
 * 实测后若失败,可能需要 'aes-256-cfb8' 或重新对齐 segmentSize。
 */

export type GoEdgeUserType = "admin" | "node" | "cluster" | "user" | "monitor" | "dns";

export function buildGoEdgeToken(secret: string, nodeId: string, type: GoEdgeUserType = "admin"): string {
  if (!secret) throw new Error("secret required");
  if (!nodeId) throw new Error("nodeId required");

  // key: pad/截断到 32 byte
  const keyBuf = Buffer.alloc(32, " ");
  const secretBytes = Buffer.from(secret, "utf8");
  secretBytes.copy(keyBuf, 0, 0, Math.min(secretBytes.length, 32));

  // iv: pad/截断到 16 byte
  const ivBuf = Buffer.alloc(16, " ");
  const ivBytes = Buffer.from(nodeId, "utf8");
  ivBytes.copy(ivBuf, 0, 0, Math.min(ivBytes.length, 16));

  const payload = JSON.stringify({
    type,
    timestamp: Date.now(),
    userId: 0,
  });

  const cipher = createCipheriv("aes-256-cfb", keyBuf, ivBuf);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(payload, "utf8")), cipher.final()]);
  return ciphertext.toString("base64");
}
