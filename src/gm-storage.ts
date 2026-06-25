import { createRequire } from "node:module";

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
}

export interface UserStats {
  total_gm_count: number;
  last_gm_date_utc: string;
  current_streak_days: number;
}

export interface UserRecord {
  telegram_id: number;
  first_name: string;
}

let _client: GmStore | undefined;

export interface GmStore {
  getStats(userId: number): Promise<UserStats | null>;
  setStats(userId: number, stats: UserStats): Promise<void>;
  isTodayDone(userId: number, dateUtc: string): Promise<boolean>;
  markTodayDone(userId: number, dateUtc: string): Promise<void>;
  addEvent(userId: number, timestampUtc: string): Promise<void>;
  getEvents(userId: number, limit?: number): Promise<string[]>;
  upsertUser(userId: number, firstName: string): Promise<void>;
  getUser(userId: number): Promise<UserRecord | null>;
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

  async addEvent(userId: number, timestampUtc: string): Promise<void> {
    const event = JSON.stringify({ user_id: userId, timestamp_utc: timestampUtc });
    await this.client.set(this.k(`event:${userId}:${timestampUtc}`), event);
  }

  async getEvents(userId: number, limit = 50): Promise<string[]> {
    const keys = await this.client.keys(this.k(`event:${userId}:*`));
    keys.sort();
    const result: string[] = [];
    const take = keys.slice(-Math.min(limit, keys.length));
    for (const key of take) {
      const raw = await this.client.get(key);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { user_id: number; timestamp_utc: string };
          result.push(parsed.timestamp_utc);
        } catch {
          // skip corrupt entries
        }
      }
    }
    return result;
  }

  async upsertUser(userId: number, firstName: string): Promise<void> {
    const record: UserRecord = { telegram_id: userId, first_name: firstName };
    await this.client.set(this.k(`user:${userId}`), JSON.stringify(record));
  }

  async getUser(userId: number): Promise<UserRecord | null> {
    const raw = await this.client.get(this.k(`user:${userId}`));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as UserRecord;
    } catch {
      return null;
    }
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
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL must be set — durable GM data requires persistent storage");
  }
  _client = new RedisGmStore(defaultRedisClient(url));
  return _client;
}

export function _resetGmStore(): void {
  _client = undefined;
}

export function _setGmStore(store: GmStore): void {
  _client = store;
}

export class _TestGmStore implements GmStore {
  private stats = new Map<number, UserStats>();
  private taps = new Map<string, boolean>();
  private events = new Map<number, string[]>();
  private users = new Map<number, UserRecord>();

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

  async addEvent(userId: number, timestampUtc: string): Promise<void> {
    const list = this.events.get(userId) ?? [];
    list.push(timestampUtc);
    this.events.set(userId, list);
  }

  async getEvents(userId: number, limit = 50): Promise<string[]> {
    const list = this.events.get(userId) ?? [];
    return list.slice(-Math.min(limit, list.length));
  }

  async upsertUser(userId: number, firstName: string): Promise<void> {
    this.users.set(userId, { telegram_id: userId, first_name: firstName });
  }

  async getUser(userId: number): Promise<UserRecord | null> {
    return this.users.get(userId) ?? null;
  }
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