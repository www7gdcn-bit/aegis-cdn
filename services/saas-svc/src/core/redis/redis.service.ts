import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor() {
    // saas-svc 默认连 logical DB=1(GoEdge 用 db=0);用 REDIS_URL=redis://...:6379/1 覆盖
    this.client = new Redis(process.env.REDIS_URL || "redis://localhost:6379/1", {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
    this.client.on("error", (e) => {
      // eslint-disable-next-line no-console
      console.error("[saas-svc/redis] error:", e.message);
    });
  }

  async set(key: string, value: string) {
    return this.client.set(key, value);
  }

  async get(key: string) {
    return this.client.get(key);
  }

  async del(key: string) {
    return this.client.del(key);
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
