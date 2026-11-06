// Round 282's prompts: Left and Right buttons for the direction (Pramikon, Sky Rampart); the step or phase to skip
// (Fatespinner, an opponent's, at your upkeep); life paid round after round with a "Pay no life" button (Plague of
// Vermin); a vote for another player, a button per player (Mob Verdict).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Pramikon: Left and Right buttons as it enters; choose Left", async ({ page }) => {
  const s = scene({ hand: ["Pramikon, Sky Rampart"], board: LANDS });
  const pramikon = one(s, "Pramikon, Sky Rampart");
  await open(page, s);
  await card(page, "Pramikon, Sky Rampart", s).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "direction" && x.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose left or right");
  await expect(bar.getByRole("button", { name: "Right", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Left", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[pramikon]!.zone === "battlefield");
  expect(after.objects[pramikon]!.chosen?.direction).toBe("left");
  expect(pageErrors(page)).toEqual([]);
});

test("Fatespinner: at your upkeep, Ana's Fatespinner makes you choose; Combat phase is skipped this turn", async ({ page }) => {
  const s0 = scene({ board: LANDS }, [{ board: ["Fatespinner"] }]);
  const s = playUntil(s0, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "skipChoice" && x.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Fatespinner");
  await expect(bar.getByRole("button", { name: "Draw step", exact: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Main phase", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Combat phase", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && (x.players[0]!.skips ?? []).length > 0);
  expect(after.players[0]!.skips).toEqual([{ what: "combat", turn: after.turn, wholeTurn: true }]);
  expect(pageErrors(page)).toEqual([]);
});

test("Plague of Vermin: pay 2 life, then Pay no life; you get two Rats", async ({ page }) => {
  const s = scene({ hand: ["Plague of Vermin"], board: LANDS });
  const life = s.players[0]!.life;
  await open(page, s);
  await card(page, "Plague of Vermin", s).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "payLifeRound" && x.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("pay any amount of life");
  const plus = bar.getByRole("button", { name: "Number plus one" });
  await plus.click();
  await plus.click();
  await bar.getByRole("button", { name: "Pay 2 life" }).click();
  // The bots answer; then it comes around to you again.
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "payLifeRound" && x.pending.player === 0 && x.players[0]!.life === life - 2);
  await expect(bar).toContainText("you've paid 2 so far");
  await bar.getByRole("button", { name: "Pay no life" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.battlefield.some((id) => x.objects[id]!.isToken));
  const rats = after.battlefield.filter((id) => after.objects[id]!.isToken && after.objects[id]!.controller === 0);
  expect(rats).toHaveLength(2);
  expect(after.players[0]!.life).toBe(life - 2);
  expect(pageErrors(page)).toEqual([]);
});

test("Mob Verdict: vote for Ana with a player button; not for yourself", async ({ page }) => {
  const s = scene({ hand: ["Mob Verdict"], board: LANDS });
  await open(page, s);
  await card(page, "Mob Verdict", s).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "vote" && x.pending.player === 0);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Ben", exact: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: "You", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Ana", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0);
  expect(after.log.some((l) => /votes are revealed: .*You for Ana/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
