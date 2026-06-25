import { createRequire } from "node:module";

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  del(key: string): Promise<unknown>;
  lpush(key: string, ...values: string[]): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  eval(script: string, numKeys: number, ...keysAndArgs: unknown[]): Promise<unknown>;
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
  tryMarkTodayDone(userId: number, dateUtc: string): Promise<boolean>;
  unmarkToday(userId: number, dateUtc: string): Promise<void>;
  addEvent(userId: number, timestampUtc: string): Promise<void>;
  getEvents(userId: number, limit?: number): Promise<string[]>;
  upsertUser(userId: number, firstName: string): Promise<void>;
  getUser(userId: number): Promise<UserRecord | null>;
  atomicRecordTap(userId: number, dateUtc: string, firstName: string, yesterday: string, timestampUtc: string): Promise<UserStats | null>;
}

class RedisGmStore implements GmStore {
  constructor(private client: RedisLike, private prefix = "gm:") {}

  private k(key: string): string {
    return this.prefix + key;
  }

  // Lua script: atomically records a GM tap (mark today + update stats + add event + upsert user).
  // Returns nil if already tapped today, else returns the new stats JSON string.
  private static readonly ATOMIC_RECORD_TAP = `
local tap_key   = KEYS[1]
local stats_key = KEYS[2]
local events_key = KEYS[3]
local user_key  = KEYS[4]

local date_utc      = ARGV[1]
local first_name    = ARGV[2]
local yesterday     = ARGV[3]
local timestamp_utc = ARGV[4]
local telegram_id   = tonumber(ARGV[5])

local result = redis.call('SET', tap_key, '1', 'NX', 'EX', 86400)
if not result then
  return nil
end

local total = 1
local streak = 1

local raw = redis.call('GET', stats_key)
if raw then
  local stats = cjson.decode(raw)
  if stats.last_gm_date_utc == yesterday then
    total  = stats.total_gm_count + 1
    streak = stats.current_streak_days + 1
  elseif stats.last_gm_date_utc ~= date_utc then
    total  = stats.total_gm_count + 1
    streak = 1
  else
    total  = stats.total_gm_count
    streak = stats.current_streak_days
  end
end

local new_stats = cjson.encode({
  total_gm_count = total,
  last_gm_date_utc = date_utc,
  current_streak_days = streak,
})

redis.call('SET', stats_key, new_stats)
redis.call('LPUSH', events_key, timestamp_utc)
redis.call('SET', user_key, cjson.encode({
  telegram_id = telegram_id,
  first_name = first_name,
}))

return new_stats`;

  async atomicRecordTap(userId: number, dateUtc: string, firstName: string, yesterday: string, timestampUtc: string): Promise<UserStats | null> {
    const keys = [
      this.k(`tap:${userId}:${dateUtc}`),
      this.k(`stats:${userId}`),
      this.k(`events:${userId}`),
      this.k(`user:${userId}`),
    ];
    const args = [dateUtc, firstName, yesterday, timestampUtc, String(userId)];
    const result = await this.client.eval(RedisGmStore.ATOMIC_RECORD_TAP, keys.length, ...keys, ...args);
    if (result === null || result === undefined) return null;
    return JSON.parse(result as string) as UserStats;
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

  async tryMarkTodayDone(userId: number, dateUtc: string): Promise<boolean> {
    const result = await this.client.set(
      this.k(`tap:${userId}:${dateUtc}`),
      "1",
      "NX",
      "EX",
      86400,
    );
    return result === "OK";
  }

  async unmarkToday(userId: number, dateUtc: string): Promise<void> {
    await this.client.del(this.k(`tap:${userId}:${dateUtc}`));
  }

  async addEvent(userId: number, timestampUtc: string): Promise<void> {
    await this.client.lpush(this.k(`events:${userId}`), timestampUtc);
  }

  async getEvents(userId: number, limit = 50): Promise<string[]> {
    const events = await this.client.lrange(
      this.k(`events:${userId}`),
      0,
      Math.min(limit, 10000) - 1,
    );
    return events;
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

  async tryMarkTodayDone(userId: number, dateUtc: string): Promise<boolean> {
    const key = `tap:${userId}:${dateUtc}`;
    if (this.taps.has(key)) return false;
    this.taps.set(key, true);
    return true;
  }

  async unmarkToday(userId: number, dateUtc: string): Promise<void> {
    this.taps.delete(`tap:${userId}:${dateUtc}`);
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

  async atomicRecordTap(userId: number, dateUtc: string, firstName: string, yesterday: string, timestampUtc: string): Promise<UserStats | null> {
    const first = await this.tryMarkTodayDone(userId, dateUtc);
    if (!first) return null;

    await this.upsertUser(userId, firstName);
    await this.addEvent(userId, timestampUtc);

    const stats = await this.getStats(userId);
    const now: UserStats = {
      total_gm_count: 1,
      last_gm_date_utc: dateUtc,
      current_streak_days: 1,
    };

    if (stats) {
      if (stats.last_gm_date_utc === yesterday) {
        now.total_gm_count = stats.total_gm_count + 1;
        now.current_streak_days = stats.current_streak_days + 1;
      } else if (stats.last_gm_date_utc === dateUtc) {
        now.total_gm_count = stats.total_gm_count;
        now.current_streak_days = stats.current_streak_days;
      } else {
        now.total_gm_count = stats.total_gm_count + 1;
        now.current_streak_days = 1;
      }
    }

    await this.setStats(userId, now);
    return now;
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