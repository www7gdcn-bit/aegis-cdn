// 公共类型(跨 service 共用)。命名靠拢 GoEdge 习惯但用 camelCase。
// Phase 3 Step 2+ 真接 proto 时可能调整字段;调用方应做兼容(用 Pick / Partial 等)。

export type EdgeUserId = number;
export type EdgeServerId = number;
export type EdgeNodeId = number;
export type EdgeClusterId = number;
export type EdgeCertId = number;
export type EdgeIpListId = number;

export interface CreateUserInput {
  username: string;        // GoEdge users.username(唯一)
  fullname?: string;
  email?: string;
  mobile?: string;
  remark?: string;
  source?: string;         // 一般固定 "aegis-saas",标识 SaaS 来源
}

export interface UserSummary {
  id: EdgeUserId;
  username: string;
  email?: string;
  state?: number;          // GoEdge users.state(0/1)
  isOn?: boolean;
}

export interface CreateDomainInput {
  userId: EdgeUserId;
  serverName: string;      // 接入域名(host)
  clusterId?: EdgeClusterId;
}

export interface DomainSummary {
  serverId: EdgeServerId;
  serverName: string;
  isOn: boolean;
  clusterId?: EdgeClusterId;
}

export interface UploadCertInput {
  userId: EdgeUserId;
  serverName: string;      // SAN
  certPem: string;
  keyPem: string;
  description?: string;
}

export interface NodeStatus {
  nodeId: EdgeNodeId;
  clusterId: EdgeClusterId;
  isOn: boolean;
  isUp: boolean;
  cpuPercent?: number;
  memPercent?: number;
  loadAvg?: number;
}

export interface IpListItem {
  type: "ipv4" | "ipv6" | "cidr";
  value: string;
  reason?: string;
  expiresAt?: Date;
}
