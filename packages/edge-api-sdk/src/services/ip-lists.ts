import { NotImplementedError } from "../errors";
import type { EdgeIpListId } from "../types";

// 代理 GoEdge IPListService / IPItemService。
// Phase 3 Step 7 — 全局封禁同步链路:
//   - saas-svc.GlobalBlock(type=ip|cidr) → bff-edge → IpListsService.addToBlocklist
//   - 释放反之
// 平台运营提前在 GoEdge 建一个 type=black/isGlobal=true 的 IPList,id 配 env EDGE_GLOBAL_BLOCK_LIST_ID。

export type IpAddrType = "ipv4" | "ipv6";

export interface AddBlocklistItemInput {
  ipListId: EdgeIpListId;       // 必填:目标 IPList(平台共享列表 id)
  value: string;                // 单 IP / CIDR / IP 范围(GoEdge 自动解析)
  type: IpAddrType;             // ipv4 | ipv6(GoEdge 要求显式指定)
  reason?: string;
  expiredAt?: Date;             // null/缺省 = 永久
  serverId?: number;            // 可选:GoEdge server.id,封禁某域名维度(本 Step 不用)
}

export interface AddBlocklistItemResult {
  ipItemId: number;
}

export interface RemoveBlocklistItemInput {
  // 二选一:ipItemId 优先;若仅有 value,则用 (ipListId, value) 删
  ipItemId?: number;
  ipListId?: EdgeIpListId;
  value?: string;
}

export interface BlocklistItemSummary {
  ipItemId: number;
  ipListId: EdgeIpListId;
  value?: string;
  type?: IpAddrType;
  reason?: string;
  expiredAt?: number;          // unix sec;0 = 永久
  createdAt?: number;
  serverId?: number;
}

export interface IpListsService {
  /**
   * 在指定 ipList 加一条 IPItem(封禁条目)。
   * Phase 3 Step 7:用于平台共享黑名单(env EDGE_GLOBAL_BLOCK_LIST_ID)。
   */
  addToBlocklist(input: AddBlocklistItemInput): Promise<AddBlocklistItemResult>;

  /** 删除 IPItem(释放封禁)。优先用 ipItemId;退而用 (ipListId, value)。 */
  removeFromBlocklist(input: RemoveBlocklistItemInput): Promise<void>;

  /** 列出指定 IPList 的条目(分页) */
  listBlocklistItems(input: {
    ipListId: EdgeIpListId;
    offset?: number;
    size?: number;
  }): Promise<BlocklistItemSummary[]>;

  /** 创建自定义 IPList(saas-svc 一般不用,平台运营手动建) */
  createList(input: { userId: number; name: string; type: "black" | "white" | "grey"; isGlobal?: boolean }): Promise<{ listId: EdgeIpListId }>;
}

export class PlaceholderIpListsService implements IpListsService {
  async addToBlocklist(_input: AddBlocklistItemInput): Promise<AddBlocklistItemResult> {
    throw new NotImplementedError("IpListsService.addToBlocklist");
  }
  async removeFromBlocklist(_input: RemoveBlocklistItemInput): Promise<void> {
    throw new NotImplementedError("IpListsService.removeFromBlocklist");
  }
  async listBlocklistItems(_input: any): Promise<BlocklistItemSummary[]> {
    throw new NotImplementedError("IpListsService.listBlocklistItems");
  }
  async createList(_input: any): Promise<{ listId: EdgeIpListId }> {
    throw new NotImplementedError("IpListsService.createList");
  }
}
