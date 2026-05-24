import * as grpc from "@grpc/grpc-js";
import type {
  AddBlocklistItemInput, AddBlocklistItemResult, BlocklistItemSummary,
  IpListsService, RemoveBlocklistItemInput,
} from "../../services/ip-lists";
import type { EdgeIpListId } from "../../types";
import { EdgeApiError } from "../../errors";

// GoEdge IPListService + IPItemService 实现。
//
// proto:
//   service_ip_list.proto:IPListService.{createIPList, deleteIPList, findEnabledIPList, ...}
//   service_ip_item.proto:IPItemService.{createIPItem, deleteIPItem, listIPItemsWithListId, ...}
//
// CreateIPItemRequest 关键字段:
//   ipListId / value(IP/CIDR/range,推荐;若用 ipFrom+ipTo 则不用 value) /
//   type("ipv4"|"ipv6") / expiredAt(unix sec, 0=永久) / reason / eventLevel /
//   serverId(可选,域名维度) / nodeId(可选)
export class GrpcIpListsService implements IpListsService {
  constructor(
    private ipListStub: any,
    private ipItemStub: any,
    private metadata: () => grpc.Metadata,
  ) {}

  async addToBlocklist(input: AddBlocklistItemInput): Promise<AddBlocklistItemResult> {
    if (!input.ipListId) throw new EdgeApiError("AddBlocklistItemInput.ipListId required");
    if (!input.value) throw new EdgeApiError("AddBlocklistItemInput.value required");

    const expiredAt = input.expiredAt ? Math.floor(input.expiredAt.getTime() / 1000) : 0;
    return new Promise<AddBlocklistItemResult>((resolve, reject) => {
      this.ipItemStub.createIPItem(
        {
          ipListId: input.ipListId,
          value: input.value,
          ipFrom: "",
          ipTo: "",
          expiredAt,
          reason: input.reason || "",
          type: input.type,
          eventLevel: "notice",
          serverId: input.serverId ?? 0,
          nodeId: 0,
          sourceNodeId: 0,
          sourceServerId: 0,
          sourceHTTPFirewallPolicyId: 0,
          sourceHTTPFirewallRuleGroupId: 0,
          sourceHTTPFirewallRuleSetId: 0,
        },
        this.metadata(),
        (err: grpc.ServiceError | null, res: any) => {
          if (err) {
            return reject(new EdgeApiError(
              `IPItemService.createIPItem failed: ${err.message}`,
              err.code != null ? String(err.code) : undefined,
              err,
            ));
          }
          const id = Number(res?.ipItemId ?? 0);
          if (!id) return reject(new EdgeApiError("createIPItem returned empty ipItemId"));
          resolve({ ipItemId: id });
        },
      );
    });
  }

  async removeFromBlocklist(input: RemoveBlocklistItemInput): Promise<void> {
    if (!input.ipItemId && !(input.ipListId && input.value)) {
      throw new EdgeApiError("removeFromBlocklist requires ipItemId or (ipListId + value)");
    }
    const req: any = {
      ipItemId: input.ipItemId ?? 0,
      value: input.value ?? "",
      ipFrom: "",
      ipTo: "",
      ipListId: input.ipListId ?? 0,
    };
    return new Promise<void>((resolve, reject) => {
      this.ipItemStub.deleteIPItem(req, this.metadata(), (err: grpc.ServiceError | null) => {
        if (err) {
          return reject(new EdgeApiError(
            `IPItemService.deleteIPItem failed: ${err.message}`,
            err.code != null ? String(err.code) : undefined,
            err,
          ));
        }
        resolve();
      });
    });
  }

  async listBlocklistItems(input: { ipListId: EdgeIpListId; offset?: number; size?: number }): Promise<BlocklistItemSummary[]> {
    return new Promise<BlocklistItemSummary[]>((resolve, reject) => {
      this.ipItemStub.listIPItemsWithListId(
        {
          ipListId: input.ipListId,
          offset: input.offset ?? 0,
          size: input.size ?? 100,
          keyword: "",
        },
        this.metadata(),
        (err: grpc.ServiceError | null, res: any) => {
          if (err) {
            return reject(new EdgeApiError(
              `IPItemService.listIPItemsWithListId failed: ${err.message}`,
              err.code != null ? String(err.code) : undefined,
              err,
            ));
          }
          const items = (res?.ipItems || []) as any[];
          resolve(items.map((i) => ({
            ipItemId: Number(i.id ?? i.ipItemId ?? 0),
            ipListId: Number(i.ipListId ?? input.ipListId),
            value: i.value,
            type: i.type,
            reason: i.reason,
            expiredAt: i.expiredAt,
            createdAt: i.createdAt,
            serverId: i.serverId,
          })));
        },
      );
    });
  }

  async createList(input: { userId: number; name: string; type: "black" | "white" | "grey"; isGlobal?: boolean }): Promise<{ listId: EdgeIpListId }> {
    return new Promise<{ listId: EdgeIpListId }>((resolve, reject) => {
      this.ipListStub.createIPList(
        {
          type: input.type,
          name: input.name,
          code: "",
          timeoutJSON: Buffer.alloc(0),
          isPublic: false,
          description: "",
          isGlobal: input.isGlobal ?? false,
          serverId: 0,
        },
        this.metadata(),
        (err: grpc.ServiceError | null, res: any) => {
          if (err) {
            return reject(new EdgeApiError(
              `IPListService.createIPList failed: ${err.message}`,
              err.code != null ? String(err.code) : undefined,
              err,
            ));
          }
          const id = Number(res?.ipListId ?? 0);
          if (!id) return reject(new EdgeApiError("createIPList returned empty ipListId"));
          resolve({ listId: id });
        },
      );
    });
  }
}
