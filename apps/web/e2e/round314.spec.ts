// Round 314: Waterbender's Restoration's "waterbend {X}" (X announced in the X picker, then exactly X targets, the {X} paid
// by tapping creatures), and Heirloom Epic's ability paid by tapping creatures when there's no mana.
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, scene } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Waterbender's Restoration: choose X = 2, pick two of your creatures, waterbend with creatures; they're exiled", async ({ page }) => {
  const s = scene({ hand: ["Waterbender's Restoration"], board: ["Island", "Island", "Grizzly Bears", "Hill Giant", "Llanowar Elves"] }, [{ board: ["Coral Merfolk"] }]);
  const [bears, giant, elves, theirs] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Llanowar Elves"), one(s, "Coral Merfolk")];
  const spell = idsOf(s, "Waterbender's Restoration", "hand", 0)[0]!;
  await open(page, s);
  await card(page, "Waterbender's Restoration", s).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("Waterbender's Restoration (waterbend {X})");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const bar = page.locator(".targeting");
  await expect(bar).toBeVisible();
  // Creatures you control only.
  await page.locator(`[data-obj="${theirs}"]`).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[spell]!.zone === "graveyard");
  expect([bears, giant, elves, theirs].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile", "battlefield", "battlefield"]);
  expect(after.log.some((e) => /to waterbend/.test(e.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Heirloom Epic: with no untapped land, its {4} is paid by tapping four creatures", async ({ page }) => {
  const s = scene({ board: ["Heirloom Epic", "Grizzly Bears", "Hill Giant", "Llanowar Elves", "Coral Merfolk"], library: ["Forest"] });
  const book = one(s, "Heirloom Epic");
  const creatures = ["Grizzly Bears", "Hill Giant", "Llanowar Elves", "Coral Merfolk"].map((n) => one(s, n));
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await page.locator(`[data-obj="${book}"]`).first().click();
  await menu(page).getByRole("button", { name: /Draw a card/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.players[0]!.hand.length === hand + 1);
  expect(creatures.every((id) => after.objects[id]!.tapped)).toBe(true);
  expect(after.objects[book]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
