import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getGmStore } from "../gm-storage.js";

registerMainMenuItem({ label: "📊 Stats", data: "stats:show", order: 20 });

function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

function buildStatsMessage(total: number, streak: number, lastDate: string): string {
  return [
    "📊 Your GM stats",
    "",
    `Total: ${total}`,
    `Streak: ${streak} day${streak === 1 ? "" : "s"}`,
    `Last: ${formatDate(lastDate)}`,
  ].join("\n");
}

const emptyStats = "No GM stats yet — tap 🌅 GM to start!";

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

const composer = new Composer<Ctx>();

composer.command("stats", async (ctx) => {
  try {
    const store = getGmStore();
    const stats = await store.getStats(ctx.from?.id ?? 0);
    if (!stats) {
      await ctx.reply(emptyStats);
    } else {
      await ctx.reply(
        buildStatsMessage(stats.total_gm_count, stats.current_streak_days, stats.last_gm_date_utc),
      );
    }
  } catch {
    await ctx.reply("Couldn't load your stats right now — please try again.");
  }
});

composer.callbackQuery("stats:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    const store = getGmStore();
    const stats = await store.getStats(ctx.from?.id ?? 0);
    if (!stats) {
      await ctx.editMessageText(emptyStats, { reply_markup: backToMenu });
    } else {
      await ctx.editMessageText(
        buildStatsMessage(stats.total_gm_count, stats.current_streak_days, stats.last_gm_date_utc),
        { reply_markup: backToMenu },
      );
    }
  } catch {
    await ctx.editMessageText("Couldn't load your stats right now — please try again.", { reply_markup: backToMenu });
  }
});

export default composer;