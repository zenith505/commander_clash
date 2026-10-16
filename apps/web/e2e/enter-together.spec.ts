// Collected Company: pick two creature cards from the top six; they enter together, so each Soul Warden sees the other.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, modal, resolveUntil } from "./ui";

test("Collected Company: pick two creatures from the top six, then order the rest on the bottom", async ({ page }) => {
  const s = scene({ hand: ["Collected Company"], board: LANDS, library: ["Soul Warden", "Soul Warden", "Hill Giant", "Shock", "Grizzly Bears", "Llanowar Elves"] });
  const [w1, w2] = idsOf(s, "Soul Warden", "library", 0);
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Collected Company", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  await expect(modal(page)).toContainText("up to 2 creature cards with mana value 3 or less");
  await expect(modal(page).locator(`[data-pick="${giant}"]`)).toHaveClass(/dim/); // mana value 4: shown, not offered
  await modal(page).locator(`[data-pick="${w1}"]`).click();
  await modal(page).locator(`[data-pick="${w2}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("put 4 cards on the bottom of your library in any order");
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.triggerQueue.length === 0);
  expect([after.objects[w1!]!.zone, after.objects[w2!]!.zone]).toEqual(["battlefield", "battlefield"]);
  expect(after.players[0]!.life).toBe(42);
  expect(pageErrors(page)).toEqual([]);
});
