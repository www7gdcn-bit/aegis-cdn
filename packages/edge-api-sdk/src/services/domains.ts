import { NotImplementedError } from "../errors";
import type { CreateDomainInput, DomainSummary, EdgeServerId, EdgeUserId } from "../types";

// 代理 GoEdge ServerService 的常用方法子集。
export interface DomainsService {
  create(input: CreateDomainInput): Promise<DomainSummary>;
  listByUser(edgeUserId: EdgeUserId): Promise<DomainSummary[]>;
  findById(serverId: EdgeServerId): Promise<DomainSummary | null>;
  remove(serverId: EdgeServerId): Promise<void>;
}

export class PlaceholderDomainsService implements DomainsService {
  async create(_input: CreateDomainInput): Promise<DomainSummary> {
    throw new NotImplementedError("DomainsService.create");
  }
  async listByUser(_edgeUserId: EdgeUserId): Promise<DomainSummary[]> {
    throw new NotImplementedError("DomainsService.listByUser");
  }
  async findById(_serverId: EdgeServerId): Promise<DomainSummary | null> {
    throw new NotImplementedError("DomainsService.findById");
  }
  async remove(_serverId: EdgeServerId): Promise<void> {
    throw new NotImplementedError("DomainsService.remove");
  }
}
