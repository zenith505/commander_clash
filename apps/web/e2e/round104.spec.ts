// Round 104's prompt: Kozilek, the Great Distortion's "Discard a card with mana value X: Counter target spell with mana
// value X." X is announced first (only values you have a card for fit), then the spell, then the card to discard.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Kozilek, the Great Distortion: X = 3, counter Divination, discard a mana value 3 card", async ({ page }) => {
  const s = scene({ hand: ["Divination", "Divination", "Divination", "Grizzly Bears", "Hill Giant"], board: ["Kozilek, the Great Distortion", ...LANDS] });
  const kozilek = one(s, "Kozilek, the Great Distortion");
  const [cast, keep, discard] = idsOf(s, "Divination", "hand") as [string, string, string];
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Divination", s).click();
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  const top = (await state(page)).stack[0]!;
  await page.locator(`[data-obj="${kozilek}"]`).click();
  await menu(page).getByRole("button", { name: /Counter target spell with mana value X/ }).click();
  const x = page.locator(".x-pick");
  // Hill Giant is the greatest mana value in hand (Divination is on the stack).
  await expect(x).toContainText("discard a card with mana value X: choose X (up to 4)");
  await x.getByLabel("X", { exact: true }).fill("3");
  await x.getByRole("button", { name: "X = 3" }).click();
  await page.locator(`[data-stack="${top.id}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("discard a card with mana value 3");
  await expect(pick.locator(`[data-pick="${bears}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${discard}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[cast]!.zone === "graveyard");
  expect(after.objects[discard]!.zone).toBe("graveyard");
  expect(after.objects[keep]!.zone).toBe("hand");
  expect(after.log.some((l) => / counters? /.test(l.text) && l.text.includes("Divination"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
