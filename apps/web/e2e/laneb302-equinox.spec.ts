// Lane B round B302 in the browser: Equinox. Cast Stone Rain at your own Swamp, then tap the enchanted Forest for its
// "Counter target spell if it would destroy a land you control" with Stone Rain on the stack as the target: it would
// destroy your land if it resolved right then (rulings), so it's countered and the Swamp stays.
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, scene, state } from "./scene";
import { menu, resolveUntil } from "./ui";
import type { GameState } from "@cc/engine";

test("Equinox: tap the enchanted Forest to counter your Stone Rain aimed at your Swamp", async ({ page }) => {
  const s = scene({ hand: ["Stone Rain"], board: ["Forest", "Swamp", "Equinox"] });
  const [rain, equinox] = [one(s, "Stone Rain"), one(s, "Equinox")];
  const [forest, swamp] = [idsOf(s, "Forest", "battlefield", 0)[0]!, idsOf(s, "Swamp", "battlefield", 0)[0]!];
  s.objects[equinox]!.attachedTo = forest;
  // Stone Rain's {2}{R} from the mana pool, so the Forest stays untapped.
  s.players[0]!.manaPool = { ...s.players[0]!.manaPool, R: 1, C: 2 };
  await open(page, s);
  await page.locator(`[data-obj="${rain}"]`).first().click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  await page.locator(`[data-obj="${swamp}"]`).click();
  let st: GameState | undefined;
  await expect.poll(async () => (st = await state(page)).stack.length).toBe(1);
  const top = st!.stack[0]!.id;
  expect(st!.objects[forest]!.tapped).toBeFalsy();
  await page.locator(`[data-obj="${forest}"]`).click();
  await menu(page).getByRole("button", { name: /Counter target spell if it would destroy a land you control/ }).click();
  await page.locator(`[data-stack="${top}"]`).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[rain]!.zone === "graveyard");
  expect(after.objects[swamp]!.zone).toBe("battlefield");
  expect(after.objects[forest]!.tapped).toBe(true);
  expect(after.log.some((l) => / counters? /.test(l.text) && l.text.includes("Stone Rain"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
