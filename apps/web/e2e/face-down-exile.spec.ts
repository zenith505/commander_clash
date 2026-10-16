// Gustha's Scepter: the ability's hand picker exiles a card face down that only you may look at; Duplicity's face-down
// cards show as card backs labeled "Face down" (CR 406.3).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { menu, modal, resolveUntil, seat } from "./ui";

test("Gustha's Scepter: pick a card from your hand to exile face down; you can still see it, others see a card back", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears", "Hill Giant"], board: [...LANDS, "Gustha's Scepter"] }, [{ board: ["Duplicity"], exile: ["Llanowar Elves"] }]);
  const [scepter, bears, duplicity, elves] = [one(s, "Gustha's Scepter"), one(s, "Grizzly Bears"), one(s, "Duplicity"), one(s, "Llanowar Elves")];
  s.objects[elves]!.hiddenExile = { by: duplicity, seen: [], label: "Face down" };
  s.linkedExile = { [`${duplicity}@0`]: [{ id: elves, zc: 0 }] };
  await open(page, s);
  // Ana's Duplicity card: nobody may look at it.
  const theirs = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await expect(theirs.locator(".zone-label")).toHaveText("Face down");
  await expect(theirs).not.toContainText("Llanowar Elves");
  await page.locator(`[data-obj="${scepter}"]`).click();
  await menu(page).getByRole("button", { name: /Exile a card from your hand face down/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "exile");
  expect(after.objects[bears]!.hiddenExile).toMatchObject({ seen: [0], label: "Face down" });
  // Yours: you may look at it.
  const mine = seat(page, 0).locator(".zone", { hasText: "Exile" });
  await expect(mine.locator(".zone-label")).toHaveCount(0);
  await mine.click();
  await expect(modal(page)).toContainText("Grizzly Bears");
  expect(pageErrors(page)).toEqual([]);
});
