// Round 452 in the browser: Karn Liberated's −14 restarts the game (CR 727). Ana's Mulldrifter, exiled with Karn, stays
// in exile; the new game starts with you going first (727.1a) and the mulligan prompt; once everyone keeps, Mulldrifter
// enters under your control before the first untap step (727.4) and its enters trigger resolves in your first upkeep.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics, type GameState } from "@cc/engine";
import { idsOf, one, open, pageErrors, scene } from "./scene";
import { controls, menu, resolveUntil, seat } from "./ui";

test("Karn Liberated: −14 restarts the game; keep, and Mulldrifter exiled with Karn enters under your control", async ({ page }) => {
  const s: GameState = scene({ board: ["Karn Liberated"] }, [{ board: ["Mulldrifter"] }]);
  const karn = one(s, "Karn Liberated");
  const md = one(s, "Mulldrifter");
  s.objects[karn]!.counters.loyalty = 20;
  // As if Karn's −3 had exiled it on an earlier turn (linked to this Karn, CR 607.2a).
  s.battlefield = s.battlefield.filter((id) => id !== md);
  s.objects[md]!.zone = "exile";
  s.players[1]!.exile.push(md);
  s.linkedExile = { [`${karn}@${s.objects[karn]!.zoneChanges ?? 0}`]: [{ id: md, zc: s.objects[md]!.zoneChanges ?? 0 }] };
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${karn}"]`).click();
  await menu(page).locator("button", { hasText: "Restart the game" }).click();
  const restarted = await resolveUntil(page, (st) => st.pending?.kind === "mulligan" && st.pending.player === 0);
  expect([restarted.turn, restarted.activePlayer, restarted.battlefield.length]).toEqual([1, 0, 0]);
  expect(restarted.players.map((p) => p.life)).toEqual([40, 40, 40, 40]);
  expect(restarted.players[0]!.hand).toHaveLength(7);
  const mdNow = idsOf(restarted, "Mulldrifter", "exile", 1);
  expect(mdNow).toHaveLength(1);
  const bar = controls(page);
  await expect(bar).toContainText("Keep 7 or mulligan? The first one is free.");
  await bar.getByRole("button", { name: "Keep" }).click();
  // The bots keep too; then Mulldrifter is yours, and its trigger draws you two in your first upkeep.
  const after = await resolveUntil(page, (st) => !st.mulligans && st.step === "main1" && st.stack.length === 0 && !st.pending, 60);
  expect([after.turn, after.activePlayer]).toEqual([1, 0]);
  const o = after.objects[mdNow[0]!]!;
  expect([o.zone, o.owner, o.controller]).toEqual(["battlefield", 1, 0]);
  expect(after.players[0]!.hand.length).toBeGreaterThanOrEqual(9);
  await expect(seat(page, 0).locator(`[data-obj="${mdNow[0]}"]`)).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});
