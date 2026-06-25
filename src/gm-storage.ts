import { createRequire } from "node:module";

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
}

export interface UserStats {
  total_gm_count: number;
  last_gm_date_utc: string;
  current_streak_days: number;
}

let _client: GmStore | undefined;

export interface GmStore {
  getStats(userId: number): Promise<UserStats | null>;
  setStats(userId: number, stats: UserStats): Promise<void>;
  isTodayDone(userId: number, dateUtc: string): Promise<boolean>;
  markTodayDone(userId: number, dateUtc: string): Promise<void>;
}

class MemoryGmStore implements GmStore {
  private stats = new Map<number, UserStats>();
  private taps = new Map<string, boolean>();

  async getStats(userId: number): Promise<UserStats | null> {
    return this.stats.get(userId) ?? null;
  }

  async setStats(userId: number, stats: UserStats): Promise<void> {
    this.stats.set(userId, stats);
  }

  async isTodayDone(userId: number, dateUtc: string): Promise<boolean> {
    return this.taps.get(`tap:${userId}:${dateUtc}`) === true;
  }

  async markTodayDone(userId: number, dateUtc: string): Promise<void> {
    this.taps.set(`tap:${userId}:${dateUtc}`, true);
  }
}

class RedisGmStore implements GmStore {
  constructor(private client: RedisLike, private prefix = "gm:") {}

  private k(key: string): string {
    return this.prefix + key;
  }

  async getStats(userId: number): Promise<UserStats | null> {
    const raw = await this.client.get(this.k(`stats:${userId}`));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as UserStats;
    } catch {
      return null;
    }
  }

  async setStats(userId: number, stats: UserStats): Promise<void> {
    await this.client.set(this.k(`stats:${userId}`), JSON.stringify(stats));
  }

  async isTodayDone(userId: number, dateUtc: string): Promise<boolean> {
    const raw = await this.client.get(this.k(`tap:${userId}:${dateUtc}`));
    return raw === "1";
  }

  async markTodayDone(userId: number, dateUtc: string): Promise<void> {
    await this.client.set(this.k(`tap:${userId}:${dateUtc}`), "1");
  }
}

function defaultRedisClient(url: string): RedisLike {
  const require = createRequire(import.meta.url);
  const ioredis: any = require("ioredis");
  const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
  return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false }) as RedisLike;
}

export function getGmStore(): GmStore {
  if (_client) return _client;
  if (process.env.REDIS_URL) {
    _client = new RedisGmStore(defaultRedisClient(process.env.REDIS_URL));
  } else {
    _client = new MemoryGmStore();
  }
  return _client;
}

export function _resetGmStore(): void {
  _client = undefined;
}

export function todayUtc(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function yesterdayUtc(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-${String(prev.getUTCDate()).padStart(2, "0")}`;
}
