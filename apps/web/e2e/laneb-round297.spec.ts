// Lane B round B297 in the browser: Yixlid Jailer ("Cards in graveyards lose all abilities"). While Ana controls it, Think
// Twice in your graveyard has no flashback, so the graveyard view doesn't offer it; Murder the Jailer and it's cast from
// there with its flashback.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Yixlid Jailer: Think Twice can't be cast from your graveyard; Murder the Jailer, then flash it back", async ({ page }) => {
  const s = scene({ hand: ["Murder"], board: [...LANDS], yard: ["Think Twice"] }, [{ board: ["Yixlid Jailer"] }]);
  const [tt, jailer] = [one(s, "Think Twice"), one(s, "Yixlid Jailer")];
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await expect(modal(page).locator(".card", { hasText: "Think Twice" })).toHaveCount(1);
  await expect(modal(page).locator(".card.playable", { hasText: "Think Twice" })).toHaveCount(0);
  await modal(page).getByRole("button", { name: "Close" }).click();
  await card(page, "Murder", s).click();
  await page.locator(`[data-obj="${jailer}"]`).first().click();
  const dead = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[jailer]!.zone === "graveyard");
  const hand = dead.players[0]!.hand.length;
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Think Twice" }).click();
  await menu(page).getByRole("button", { name: /^Flashback/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[tt]!.zone === "exile");
  expect(after.players[0]!.hand.length).toBe(hand + 1);
  expect(pageErrors(page)).toEqual([]);
});
