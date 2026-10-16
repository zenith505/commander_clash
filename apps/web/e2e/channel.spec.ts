// Channel abilities from your hand (CR 602.2b): a land in hand offers its channel ability in the card's menu, discarding
// it is the cost, and a target is chosen like any ability's. "Return a creature card from your graveyard to your hand"
// is chosen as it resolves, in the same picker as a search, showing your graveyard.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Takenuma: channel from your hand, mill three, then pick a creature card from your graveyard", async ({ page }) => {
  const s = scene({ hand: ["Takenuma, Abandoned Mire"], board: LANDS, library: ["Grizzly Bears", "Hill Giant", "Forest"] });
  const [takenuma, bears, giant] = [one(s, "Takenuma, Abandoned Mire"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Takenuma, Abandoned Mire", s).click();
  await menu(page).locator("button", { hasText: "Channel" }).click();
  expect((await state(page)).objects[takenuma]!.zone).toBe("graveyard");
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("return a creature or planeswalker card from your graveyard to your hand");
  await expect(pick).toContainText("Your graveyard");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!.zone).toBe("hand");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Boseiju: channel at a nonbasic land an opponent controls", async ({ page }) => {
  const s = scene({ hand: ["Boseiju, Who Endures"], board: LANDS }, [{ board: ["Command Tower", "Forest"] }]);
  const [boseiju, tower] = [one(s, "Boseiju, Who Endures"), one(s, "Command Tower")];
  await open(page, s);
  await card(page, "Boseiju, Who Endures", s).click();
  await menu(page).locator("button", { hasText: "Channel" }).click();
  await page.locator(`[data-obj="${tower}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[boseiju]!.zone).toBe("graveyard");
  expect(after.objects[tower]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
