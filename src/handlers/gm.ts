import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import {
  getGmStore,
  todayUtc,
  yesterdayUtc,
  type UserStats,
} from "../gm-storage.js";

registerMainMenuItem({ label: "🌅 GM", data: "gm:tap", order: 10 });

const GREETINGS = [
  (name: string) => `🌅 Good morning, ${name}! Have a great day!`,
  (name: string) => `☀️ Rise and shine, ${name}! Hope today brings you joy.`,
  (name: string) => `🌞 Morning, ${name}! Another day, another adventure!`,
];

function pickGreeting(totalGmCount: number): (name: string) => string {
  return GREETINGS[totalGmCount % GREETINGS.length];
}

const composer = new Composer<Ctx>();

composer.callbackQuery("gm:tap", async (ctx) => {
  const user = ctx.from;
  if (!user) return;

  const today = todayUtc();
  let marked = false;

  try {
    const store = getGmStore();
    const firstTapToday = await store.tryMarkTodayDone(user.id, today);
    if (!firstTapToday) {
      await ctx.answerCallbackQuery({ text: "You've already checked in today ☀️", show_alert: false });
      return;
    }
    marked = true;

    await store.upsertUser(user.id, user.first_name);
    await store.addEvent(user.id, new Date().toISOString());

    let stats = await store.getStats(user.id);
    const now: UserStats = {
      total_gm_count: 1,
      last_gm_date_utc: today,
      current_streak_days: 1,
    };

    if (stats) {
      const yesterday = yesterdayUtc(today);
      if (stats.last_gm_date_utc === yesterday) {
        now.total_gm_count = stats.total_gm_count + 1;
        now.current_streak_days = stats.current_streak_days + 1;
      } else if (stats.last_gm_date_utc === today) {
        now.total_gm_count = stats.total_gm_count;
        now.current_streak_days = stats.current_streak_days;
      } else {
        now.total_gm_count = stats.total_gm_count + 1;
        now.current_streak_days = 1;
      }
    }

    await store.setStats(user.id, now);

    await ctx.answerCallbackQuery();

    const greeting = pickGreeting(now.total_gm_count);
    await ctx.reply(greeting(user.first_name));
  } catch {
    if (marked) {
      const store = getGmStore();
      try { await store.unmarkToday(user.id, today); } catch { /* best-effort rollback */ }
    }
    await ctx.reply("Something went wrong — please try again.");
  }
});

export default composer;