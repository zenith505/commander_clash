// Lane B round B173 in the browser: Key to the Side-Door's discard picker offers only a legendary card named like a
// legendary permanent you control; Skyblade's Boon's {2}{W} returns it to your hand from your graveyard; Glimpse the Cosmos
// is cast from your graveyard for {U} while you control a Giant, then exiled.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Key to the Side-Door: discard Isamaru (you control one), not Grizzly Bears, and draw two", async ({ page }) => {
  const s = scene({ hand: ["Isamaru, Hound of Konda", "Grizzly Bears"], board: [...LANDS, "Key to the Side-Door", "Isamaru, Hound of Konda"] });
  const [inHand, bears] = [idsOf(s, "Isamaru, Hound of Konda", "hand", 0)[0]!, one(s, "Grizzly Bears")];
  const handBefore = s.players[0]!.hand.length;
  await open(page, s);
  await card(page, "Key to the Side-Door", s).click();
  await menu(page).locator("button", { hasText: "Discard a legendary card" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("legendary card with the same name as a legendary permanent you control");
  await expect(pick.locator(`[data-pick="${bears}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${inHand}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[inHand]!.zone === "graveyard");
  expect(after.players[0]!.hand.length).toBe(handBefore - 1 + 2);
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Skyblade's Boon: from your graveyard, {2}{W} returns it to your hand", async ({ page }) => {
  const s = scene({ board: LANDS, yard: ["Skyblade's Boon"] });
  const boon = one(s, "Skyblade's Boon");
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Skyblade's Boon" }).click();
  await menu(page).getByRole("button", { name: /Return Skyblade's Boon/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[boon]!.zone === "hand");
  expect(after.objects[boon]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Glimpse the Cosmos: cast it from your graveyard for {U} with a Giant; take a card, and it's exiled", async ({ page }) => {
  const s = scene({ board: ["Island", "Hill Giant"], yard: ["Glimpse the Cosmos"], library: ["Shock", "Divination", "Lightning Bolt"] });
  const [glimpse, shock] = [one(s, "Glimpse the Cosmos"), one(s, "Shock")];
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Glimpse the Cosmos" }).click();
  await menu(page).getByRole("button", { name: /^Cast from graveyard/ }).click();
  const dig = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  expect((dig.pending as { cards: string[] }).cards).toContain(shock);
  await modal(page).locator(`[data-pick="${shock}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.objects[shock]!.zone === "hand" && (st.pending?.kind === "arrangeTop" || (st.stack.length === 0 && !st.pending)));
  if (after.pending?.kind === "arrangeTop") await modal(page).getByRole("button", { name: "Done" }).click();
  const done = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[glimpse]!.zone !== "stack");
  expect(done.objects[glimpse]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
