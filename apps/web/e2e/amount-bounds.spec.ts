// "Return another target non-Bear creature card with mana value less than or equal to this creature's power" (Fiendish
// Panda): the graveyard picker offers only the cards its power as it last existed allows (CR 608.2h).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, modal, resolveUntil } from "./ui";

test("Fiendish Panda: only creature cards with mana value up to its power are offered", async ({ page }) => {
  const s = scene({ hand: ["Shock"], board: [...LANDS, "Fiendish Panda"], yard: ["Gray Ogre", "Hill Giant", "Grizzly Bears"] });
  const panda = one(s, "Fiendish Panda"), ogre = one(s, "Gray Ogre"), giant = one(s, "Hill Giant"), bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Shock", s).click();
  await page.locator(`[data-obj="${panda}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.objects[panda]!.zone === "graveyard");
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${ogre}"]`)).toHaveCount(1);
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveCount(0); // mana value 4, power 3
  await expect(pick.locator(`[data-pick="${bears}"]`)).toHaveCount(0); // a Bear
  await pick.locator(`[data-pick="${ogre}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ogre]!.zone === "battlefield");
  expect(after.objects[ogre]!.controller).toBe(0);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
