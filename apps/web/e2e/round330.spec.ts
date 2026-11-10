// Round 330's button: an emblem of yours with an activated ability (Karn, Living Legacy's, Ob Nixilis of the Black
// Oath's) is a button in your seat's header; clicking it opens its menu, and the ability is activated from the command
// zone (CR 114.4), its costs paid with permanents you control.
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { menu, resolveUntil } from "./ui";

/** Activate the planeswalker's ultimate in the engine and let it resolve, before the page opens. */
function ultimate(s: GameState, walker: string, index: number): GameState {
  s.objects[walker]!.counters.loyalty = 8;
  for (const a of planActivate(s, 0, walker, index)!) s = applyAction(s, a);
  for (let i = 0; i < 20 && s.stack.length; i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  expect(s.stack).toHaveLength(0);
  return s;
}

test("Karn, Living Legacy's emblem: click it, target Ana's creature, tap an artifact, and the emblem deals 1 damage", async ({ page }) => {
  let s: GameState = scene({ board: [...LANDS, "Karn, Living Legacy", "Ornithopter"] }, [{ board: ["Llanowar Elves"] }]);
  const [thopter, elves] = [one(s, "Ornithopter"), one(s, "Llanowar Elves")];
  s = ultimate(s, one(s, "Karn, Living Legacy"), 2);
  const em = (s.emblems ?? [])[0]!;
  await open(page, s);
  await page.locator(`button[data-emblem="${em}"]`).click();
  await menu(page).locator("button", { hasText: "deals 1 damage to any target" }).click();
  await page.locator(`[data-obj="${elves}"]`).first().click();
  const bar = page.locator(".targeting", { hasText: "tap an untapped artifact you control" });
  await expect(bar).toHaveCount(1);
  await page.locator(`[data-obj="${thopter}"]`).first().click();
  await bar.getByRole("button", { name: "Tap and activate" }).click();
  const after = await resolveUntil(page, (x) => !x.stack.length && !x.pending && x.objects[elves]!.zone === "graveyard");
  expect(after.objects[thopter]!.tapped).toBe(true);
  expect(after.emblems).toContain(em);
  expect(pageErrors(page)).toEqual([]);
});

test("Ob Nixilis of the Black Oath's emblem: click it, sacrifice a 3-power creature, gain 3 life and draw 3 cards", async ({ page }) => {
  let s: GameState = scene({ board: [...LANDS, "Ob Nixilis of the Black Oath", "Hill Giant"] });
  const giant = one(s, "Hill Giant");
  s = ultimate(s, one(s, "Ob Nixilis of the Black Oath"), 2);
  const em = (s.emblems ?? [])[0]!;
  const [life, hand] = [s.players[0]!.life, s.players[0]!.hand.length];
  await open(page, s);
  await page.locator(`button[data-emblem="${em}"]`).click();
  await menu(page).locator("button", { hasText: "Sacrifice a creature" }).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice a creature" });
  await expect(bar).toHaveCount(1);
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await bar.getByRole("button", { name: "Sacrifice and activate" }).click();
  const after = await resolveUntil(page, (x) => !x.stack.length && !x.pending && x.objects[giant]!.zone === "graveyard" && x.players[0]!.life === life + 3);
  expect(after.players[0]!.hand.length).toBe(hand + 3);
  expect(pageErrors(page)).toEqual([]);
});
