// "Return a creature card from your graveyard to the battlefield" (Tomb Fortress) isn't targeted: you pick the card as
// the ability resolves, from the creature cards in your graveyard only.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Tomb Fortress: pick the creature card to return from your graveyard to the battlefield", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Tomb Fortress"], yard: ["Grizzly Bears", "Hill Giant", "Shock"] });
  const [bears, giant, shock] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Tomb Fortress", s).click();
  await menu(page).locator("button", { hasText: "Mill four cards" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Tomb Fortress: return a creature card from your graveyard to the battlefield");
  await expect(pick.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!).toMatchObject({ zone: "battlefield", controller: 0 });
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
