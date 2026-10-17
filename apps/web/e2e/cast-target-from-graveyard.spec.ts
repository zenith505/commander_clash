// "You may cast target instant card from your graveyard without paying its mana cost. If that spell would be put into
// your graveyard, exile it instead." (Torrential Gearhulk): pick the card as the trigger's target, then cast it.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

test("Torrential Gearhulk: cast Lightning Bolt from your graveyard for free, then it's exiled", async ({ page }) => {
  const s = scene({ hand: ["Torrential Gearhulk"], board: LANDS, yard: ["Lightning Bolt", "Shock"] });
  const bolt = one(s, "Lightning Bolt");
  await open(page, s);
  await card(page, "Torrential Gearhulk", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  await modal(page).locator(`[data-pick="${bolt}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree");
  await expect(controls(page)).toContainText("cast Lightning Bolt without paying its mana cost?");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "exile");
  expect(after.players[1]!.life).toBe(37);
  expect(after.objects[one(s, "Shock")]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
