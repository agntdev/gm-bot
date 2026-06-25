import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildBot } from "../src/bot.js";
import { runSpecs, parseBotSpecs } from "../src/toolkit/index.js";
import { _resetGmStore } from "../src/gm-storage.js";

function loadSpecs(name: string) {
  const raw = JSON.parse(
    readFileSync(new URL(`./specs/${name}.json`, import.meta.url), "utf8"),
  ) as unknown[];
  return parseBotSpecs(raw);
}

function logFailures(suite: Awaited<ReturnType<typeof runSpecs>>) {
  suite.results.filter((r) => !r.ok).forEach((r) => {
    r.steps.forEach((s, i) => {
      if (!s.ok && s.failures.length) console.error(`  spec "${r.name}" step ${i + 1}:`, s.failures);
    });
  });
}

async function runOneSpec(name: string, idx: number) {
  _resetGmStore();
  const allSpecs = loadSpecs(name);
  const spec = allSpecs[idx];
  return runSpecs(() => buildBot("test-token"), [spec]);
}

describe("GM handler", () => {
  it("first GM tap sends a greeting", async () => {
    const suite = await runOneSpec("gm", 0);
    logFailures(suite);
    expect(suite.failed).toBe(0);
    expect(suite.passed).toBe(1);
  });

  it("repeat GM tap shows only callback confirmation", async () => {
    const suite = await runOneSpec("gm", 1);
    logFailures(suite);
    expect(suite.failed).toBe(0);
    expect(suite.passed).toBe(1);
  });
});

describe("Stats handler", () => {
  it("/stats with no GM history shows empty state", async () => {
    const suite = await runOneSpec("stats", 0);
    logFailures(suite);
    expect(suite.failed).toBe(0);
    expect(suite.passed).toBe(1);
  });

  it("/stats after a GM tap shows accumulated stats", async () => {
    const suite = await runOneSpec("stats", 1);
    logFailures(suite);
    expect(suite.failed).toBe(0);
    expect(suite.passed).toBe(1);
  });

  it("stats button from menu shows empty state when no GM", async () => {
    const suite = await runOneSpec("stats", 2);
    logFailures(suite);
    expect(suite.failed).toBe(0);
    expect(suite.passed).toBe(1);
  });

  it("stats button from menu shows stats after GM", async () => {
    const suite = await runOneSpec("stats", 3);
    logFailures(suite);
    expect(suite.failed).toBe(0);
    expect(suite.passed).toBe(1);
  });
});

describe("/start menu integrity", () => {
  it("/start still works with new handlers loaded", async () => {
    _resetGmStore();
    const specs = loadSpecs("start");
    const suite = await runSpecs(() => buildBot("test-token"), specs);
    logFailures(suite);
    expect(suite.failed).toBe(0);
  });
});

describe("Help handler integrity", () => {
  it("/help still works with new handlers loaded", async () => {
    _resetGmStore();
    const specs = loadSpecs("help");
    const suite = await runSpecs(() => buildBot("test-token"), specs);
    logFailures(suite);
    expect(suite.failed).toBe(0);
  });
});