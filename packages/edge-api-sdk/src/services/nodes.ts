import { NotImplementedError } from "../errors";
import type { EdgeClusterId, EdgeNodeId, NodeStatus } from "../types";

// 代理 GoEdge NodeService / NodeClusterService 的只读方法。
// bff-edge 不直接增删节点(节点接入由运维通过 GoEdge 自带流程),只提供运营观察。
export interface NodesService {
  list(): Promise<NodeStatus[]>;
  findById(nodeId: EdgeNodeId): Promise<NodeStatus | null>;
  listByCluster(clusterId: EdgeClusterId): Promise<NodeStatus[]>;
}

export class PlaceholderNodesService implements NodesService {
  async list(): Promise<NodeStatus[]> {
    throw new NotImplementedError("NodesService.list");
  }
  async findById(_nodeId: EdgeNodeId): Promise<NodeStatus | null> {
    throw new NotImplementedError("NodesService.findById");
  }
  async listByCluster(_clusterId: EdgeClusterId): Promise<NodeStatus[]> {
    throw new NotImplementedError("NodesService.listByCluster");
  }
}
