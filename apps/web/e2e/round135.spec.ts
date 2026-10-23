// Round 135's table and prompts: the "no life gain" mark on a player Screaming Nemesis damaged, and Transmute Artifact's
// pay-the-difference prompt.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

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

test("Transmute Artifact: the artifact found costs {4} more than the one sacrificed; Pay puts it onto the battlefield", async ({ page }) => {
  const s = scene({ hand: ["Transmute Artifact"], board: [...LANDS, "Mind Stone"], library: ["Wurmcoil Engine"] });
  const [stone, wurm] = [one(s, "Mind Stone"), one(s, "Wurmcoil Engine")];
  await open(page, s);
  await card(page, "Transmute Artifact", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" || st.pending?.kind === "pickPermanents");
  // Mind Stone is the only artifact: sacrificed without a choice.
  let st = await state(page);
  expect(st.objects[stone]!.zone).toBe("graveyard");
  const pick = modal(page);
  await pick.locator(`[data-pick="${wurm}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseMay");
  await expect(controls(page)).toContainText(/Pay\s*4\s*to put Wurmcoil Engine onto the battlefield/);
  await expect(controls(page)).toContainText("If you don't, Wurmcoil Engine is put into its owner's graveyard.");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  st = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending);
  expect(st.objects[wurm]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
