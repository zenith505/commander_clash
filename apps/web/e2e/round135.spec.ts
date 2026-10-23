// Round 135's table and prompts: the "no life gain" mark on a player Screaming Nemesis damaged.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, resolveUntil } from "./ui";

test("Screaming Nemesis: after it deals 3 to Ana, her seat shows she can't gain life for the rest of the game", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Screaming Nemesis"] });
  const nemesis = one(s, "Screaming Nemesis");
  await open(page, s);
  await expect(page.locator("[data-no-lifegain]")).toHaveCount(0);
  await card(page, "Lightning Bolt", s).click();
  await page.locator(`[data-obj="${nemesis}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.objects[nemesis]!.zone === "graveyard");
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.players[1]!.cantGainLifeForGame);
  const mark = page.locator('[data-no-lifegain="1"]');
  await expect(mark).toBeVisible();
  await expect(mark).toContainText("No life gain (game)");
  await expect(mark).toHaveAttribute("title", /can't gain life for the rest of the game/);
  await expect(page.locator("[data-no-lifegain]")).toHaveCount(1);
  expect(pageErrors(page)).toEqual([]);
});
