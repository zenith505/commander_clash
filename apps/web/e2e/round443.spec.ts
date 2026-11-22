// Round 443: Etrata, Deadly Fugitive (a cloaked Lightning Bolt's granted "{2}{U}{B}: Turn this creature face up. If you
// can't, exile it, then you may cast the exiled card without paying its mana cost.": it stays face down, is exiled, and
// is cast for free at an opponent).
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { clickPlayer, controls, menu, resolveUntil } from "./ui";

test("Etrata, Deadly Fugitive: a cloaked Lightning Bolt can't turn face up, so it's exiled and cast for free", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Etrata, Deadly Fugitive", "Lightning Bolt"] });
  const bolt = one(s, "Lightning Bolt");
  s.objects[bolt]!.faceDown = "cloak";
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${bolt}"]`).click();
  // Its own way to turn face up (its mana cost) isn't there: it isn't a creature card (CR 701.58b).
  await expect(menu(page).getByRole("button", { name: /Turn face up: mana cost/ })).toHaveCount(0);
  await menu(page).getByRole("button", { name: /face up\. If you can't, exile it/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree");
  await expect(controls(page)).toContainText("cast Lightning Bolt without paying its mana cost?");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(37);
  expect(after.log.some((l) => /reveals the face-down permanent, Lightning Bolt/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
