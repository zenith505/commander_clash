// Seasons Past: "Return any number of cards with different mana values from your graveyard to your hand": once a card
// is chosen, the others with its mana value can't be.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, modal, resolveUntil } from "./ui";

test("Seasons Past: a second card with the same mana value can't be chosen", async ({ page }) => {
  const s = scene({ hand: ["Seasons Past"], board: LANDS, yard: ["Grizzly Bears", "Runeclaw Bear", "Lightning Bolt", "Hill Giant"] });
  const [bears, runeclaw, bolt, giant] = ["Grizzly Bears", "Runeclaw Bear", "Lightning Bolt", "Hill Giant"].map((n) => one(s, n)) as [string, string, string, string];
  await open(page, s);
  await card(page, "Seasons Past", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("you may return any number of cards with different mana values from your graveyard to your hand");
  await pick.locator(`[data-pick="${bears}"]`).click();
  // Runeclaw Bear has mana value 2 too: it's dimmed and clicking it does nothing.
  await expect(pick.locator(`[data-pick="${runeclaw}"]`)).toHaveClass(/dim/);
  await pick.locator(`[data-pick="${runeclaw}"]`).click();
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await expect(pick.locator("[data-found]")).toHaveCount(2);
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const after = await state(page);
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(after.objects[bolt]!.zone).toBe("hand");
  expect(after.objects[runeclaw]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  // Seasons Past goes to the bottom of your library.
  const lib = after.players[0]!.library;
  expect(after.cards[after.objects[lib[lib.length - 1]!]!.cardId]!.name).toBe("Seasons Past");
  expect(pageErrors(page)).toEqual([]);
});
