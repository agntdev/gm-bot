import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

// /help — plain-language explanation for non-technical users. This bot is
// button-driven: tell the user to tap /start to open the menu rather than listing
// slash commands. The same text is shown when the user taps the Help button on the
// main menu (`menu:help`). Enhance the copy for your specific bot; keep it short.
const composer = new Composer<Ctx>();

const HELP =
  "🌅 GM Bot — track your daily morning check-ins!\n\n" +
  "Tap 🌅 GM once per UTC day to check in. If you tap again the same day, " +
  "you'll see a quiet confirmation — no spam.\n\n" +
  "📊 Stats shows your total GM count, current streak, and last check-in date. " +
  "A streak is the number of consecutive UTC days you've checked in. " +
  "Missing a day resets it.\n\n" +
  "Commands:\n" +
  "/start — open the main menu\n" +
  "/stats — view your GM statistics\n" +
  "/help — show this explanation";

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

composer.command("help", async (ctx) => {
  await ctx.reply(HELP);
});

composer.callbackQuery("menu:help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(HELP, { reply_markup: backToMenu });
});

export default composer;
