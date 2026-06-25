import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import {
  getGmStore,
  todayUtc,
  yesterdayUtc,
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
  if (!user) {
    await ctx.answerCallbackQuery({ text: "Could not identify you." });
    return;
  }

  const today = todayUtc();
  const yesterday = yesterdayUtc(today);
  const timestamp = new Date().toISOString();

  try {
    const store = getGmStore();
    const newStats = await store.atomicRecordTap(
      user.id,
      today,
      user.first_name,
      yesterday,
      timestamp,
    );

    if (!newStats) {
      await ctx.answerCallbackQuery({ text: "You've already checked in today ☀️", show_alert: false });
      return;
    }

    await ctx.answerCallbackQuery();

    const greeting = pickGreeting(newStats.total_gm_count);
    await ctx.reply(greeting(user.first_name));
  } catch {
    try {
      await ctx.answerCallbackQuery({ text: "Something went wrong — please try again." });
    } catch {
      /* callback may already be answered or expired */
    }
    await ctx.reply("Something went wrong — please try again.");
  }
});

export default composer;