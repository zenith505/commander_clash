// Round 176: Lluwen, Imperfect Naturalist mills four, then you may put a creature or land card from among the milled
// cards back on top of your library, picked as the trigger resolves.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, modal, resolveUntil } from "./ui";

test("Lluwen: pick a milled creature card to put back on top of your library", async ({ page }) => {
  const s = scene({ hand: ["Lluwen, Imperfect Naturalist"], board: LANDS, library: ["Hill Giant", "Shock", "Grizzly Bears", "Lightning Bolt"] });
  const [giant, shock] = [one(s, "Hill Giant"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Lluwen, Imperfect Naturalist", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("on top of your library");
  await expect(pick.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[0]!.library[0]).toBe(giant);
  expect(after.objects[shock]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
