// Lane B round B219 in the browser: Trove of Temptation refuses "No attacks" while you could attack its controller;
// Dreamshaper Shaman's end step question (pay {2}{R} and sacrifice a nonland permanent) puts the first nonland permanent
// card of your library onto the battlefield; Garruk, Curse Breaker's −4 from its menu.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, controls, menu, resolveUntil } from "./ui";
import { invalidateCharacteristics, type GameState } from "@cc/engine";

test("Trove of Temptation: No attacks is refused while Grizzly Bears can attack Ana; attacking Ana with it is fine", async ({ page }) => {
  let s: GameState = scene({ board: ["Grizzly Bears"] }, [{ board: ["Trove of Temptation"] }]);
  const bears = one(s, "Grizzly Bears");
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await open(page, s);
  await expect(controls(page)).toContainText("Click a creature, then the player it attacks");
  await controls(page).getByRole("button", { name: "No attacks" }).click();
  await expect(page.locator(".error")).toContainText("must attack Ana or a planeswalker they control with at least one creature");
  await attack(page, [[bears, 1]]);
  const after = await resolveUntil(page, (st) => st.objects[bears]!.attacking === 1);
  expect(after.objects[bears]!.attacking).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Dreamshaper Shaman: at your end step, pay {2}{R} and sacrifice Grizzly Bears; Hill Giant, under Divination, enters", async ({ page }) => {
  let s: GameState = scene({ board: [...LANDS, "Dreamshaper Shaman", "Grizzly Bears"], library: ["Divination", "Hill Giant"] });
  const [shaman, bears, div, giant] = [one(s, "Dreamshaper Shaman"), one(s, "Grizzly Bears"), one(s, "Divination"), one(s, "Hill Giant")];
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  await expect(controls(page)).toContainText("Dreamshaper Shaman");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).click();
  await controls(page).getByRole("button", { name: "Sacrifice", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "battlefield" && !st.pending && st.stack.length === 0);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[shaman]!.zone).toBe("battlefield");
  expect(after.players[0]!.library.at(-1)).toBe(div);
  expect(pageErrors(page)).toEqual([]);
});

test("Garruk, Curse Breaker: −4 from its menu sets up the trigger until your next turn", async ({ page }) => {
  const s = scene({ board: ["Garruk, Curse Breaker"] });
  const garruk = one(s, "Garruk, Curse Breaker");
  s.objects[garruk]!.counters.loyalty = 5;
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${garruk}"]`).first().click();
  await menu(page).getByRole("button", { name: /^−4/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.floatingTriggers?.length);
  expect(after.objects[garruk]!.counters.loyalty).toBe(1);
  expect(after.floatingTriggers![0]).toMatchObject({ controller: 0, until: "yourNextTurn" });
  expect(pageErrors(page)).toEqual([]);
});
