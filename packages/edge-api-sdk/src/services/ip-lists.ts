import { NotImplementedError } from "../errors";
import type { EdgeIpListId, IpListItem } from "../types";

// 代理 GoEdge IPListService / IPItemService。
// bff-edge /internal/edge/blocks 后台同步 saas-svc GlobalBlock 到 GoEdge 这里。
export interface IpListsService {
  addItemToGlobalBlocklist(item: IpListItem): Promise<void>;
  removeItemFromGlobalBlocklist(value: string): Promise<void>;
  listGlobalBlocklist(): Promise<IpListItem[]>;
  // 自定义 IP 列表(给某客户用)
  createList(input: { userId: number; name: string }): Promise<{ listId: EdgeIpListId }>;
}

export class PlaceholderIpListsService implements IpListsService {
  async addItemToGlobalBlocklist(_item: IpListItem): Promise<void> {
    throw new NotImplementedError("IpListsService.addItemToGlobalBlocklist");
  }
  async removeItemFromGlobalBlocklist(_value: string): Promise<void> {
    throw new NotImplementedError("IpListsService.removeItemFromGlobalBlocklist");
  }
  async listGlobalBlocklist(): Promise<IpListItem[]> {
    throw new NotImplementedError("IpListsService.listGlobalBlocklist");
  }
  async createList(_input: { userId: number; name: string }): Promise<{ listId: EdgeIpListId }> {
    throw new NotImplementedError("IpListsService.createList");
  }
}
