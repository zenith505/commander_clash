// "You may cast this card from your graveyard as long as you control a Zombie" (Gravecrawler): the graveyard view
// offers the card, and its menu casts it for its mana cost.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { menu, modal, resolveUntil } from "./ui";

test("Gravecrawler: cast it from your graveyard while you control a Zombie", async ({ page }) => {
  const s = scene({ board: ["Swamp", "Swamp", "Walking Corpse"], yard: ["Gravecrawler"] });
  const crawler = one(s, "Gravecrawler");
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Gravecrawler" }).click();
  await menu(page).getByRole("button", { name: /^Cast from graveyard/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[crawler]!.zone === "battlefield");
  expect(after.objects[crawler]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
