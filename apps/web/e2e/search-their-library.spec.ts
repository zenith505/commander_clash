// Bribery: "Search target opponent's library for a creature card and put that card onto the battlefield under your
// control": the search prompt shows that opponent's creature cards, and the one picked enters under your control.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, modal, resolveUntil } from "./ui";

test("Bribery: pick a creature card from an opponent's library", async ({ page }) => {
  const s = scene({ hand: ["Bribery"], board: LANDS }, [{ library: ["Hill Giant", "Shock"] }]);
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Bribery", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  await expect(modal(page)).toContainText("Bribery");
  await expect(modal(page).locator(`[data-pick="${one(s, "Shock")}"]`)).toHaveCount(0);
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[giant]?.zone === "battlefield");
  expect(after.objects[giant]).toMatchObject({ controller: 0, owner: 1 });
  expect(pageErrors(page)).toEqual([]);
});
