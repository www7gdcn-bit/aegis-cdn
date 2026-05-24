import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
    this.client.on("error", (e) => {
      // 控制面不因 Redis 抖动崩溃;下发会重试
      // eslint-disable-next-line no-console
      console.error("[redis] error:", e.message);
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
