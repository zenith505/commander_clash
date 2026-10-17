// "Search your library and/or graveyard ... If you search your library this way, shuffle.": choose to search only the
// graveyard (no shuffle), then pick the card.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Tower Winder: search only the graveyard for Command Tower", async ({ page }) => {
  const s = scene({ hand: ["Tower Winder"], board: LANDS, yard: ["Command Tower"] });
  const tower = one(s, "Command Tower");
  const order = [...s.players[0]!.library];
  await open(page, s);
  await card(page, "Tower Winder", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  await expect(controls(page)).toContainText("search your library too (then shuffle), or only your graveyard?");
  await controls(page).getByRole("button", { name: "Graveyard only" }).click();
  const pick = modal(page);
  await pick.locator(`[data-pick="${tower}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const after = await state(page);
  expect(after.objects[tower]!.zone).toBe("hand");
  expect(after.players[0]!.library).toEqual(order);
  expect(pageErrors(page)).toEqual([]);
});
