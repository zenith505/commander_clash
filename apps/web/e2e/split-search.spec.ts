// "Search your library for up to three basic land cards and reveal them. Put two of them onto the battlefield tapped and
// the other into your hand, then shuffle." (Viewpoint Synchronization): the first two found go onto the battlefield.
import { expect, test } from "@playwright/test";
import { LANDS, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Viewpoint Synchronization: the first two lands found enter tapped, the third goes to the hand", async ({ page }) => {
  const s = scene({ hand: ["Viewpoint Synchronization"], board: LANDS });
  const named = (st: typeof s, id: string) => st.cards[st.objects[id]!.cardId]!.name;
  await open(page, s);
  await card(page, "Viewpoint Synchronization", s).click();
  // Its menu offers the freerunning cost too (not payable here): cast it for its mana cost.
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("The first 2 you find go onto the battlefield tapped, the other into your hand.");
  // The library's cards are grouped by name: each click finds one more of them.
  const library = pick.locator("[data-pick]");
  await library.filter({ hasText: "Forest" }).last().click();
  await library.filter({ hasText: "Forest" }).last().click();
  await library.filter({ hasText: "Island" }).last().click();
  await expect(pick.getByText("into your hand", { exact: true })).toHaveCount(1);
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const found = after.battlefield.filter((id) => !s.battlefield.includes(id) && named(after, id) === "Forest");
  expect(found).toHaveLength(2);
  expect(found.filter((id) => after.objects[id]!.tapped)).toHaveLength(2);
  expect(after.players[0]!.hand.map((id) => named(after, id))).toEqual(["Island"]);
  expect(pageErrors(page)).toEqual([]);
});
