// Round 291's pick: Queen Kayla bin-Kroog discards your hand, draws that many, then you choose up to one artifact or
// creature card of each mana value 1, 2 and 3 among the cards discarded, and they return to the battlefield.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Queen Kayla bin-Kroog: pick discarded artifact or creature cards with different mana values 1 to 3", async ({ page }) => {
  const s = scene({ hand: ["Sol Ring", "Mind Stone", "Grizzly Bears", "Hill Giant", "Shock"], board: ["Queen Kayla bin-Kroog", ...LANDS] });
  const [ring, stone, bears, giant, shock] = [one(s, "Sol Ring"), one(s, "Mind Stone"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Queen Kayla bin-Kroog", s).click();
  await menu(page).locator("button", { hasText: "Discard all the cards in your hand" }).click();
  const seen = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  expect(seen.players[0]!.hand).toHaveLength(5);
  const pick = modal(page);
  await expect(pick).toContainText("Queen Kayla bin-Kroog");
  // The mana value 4 creature and the instant can't be chosen.
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveCount(0);
  await expect(pick.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${ring}"]`).click();
  await pick.locator(`[data-pick="${stone}"]`).click();
  // Grizzly Bears has the same mana value as Mind Stone, so it's dimmed now.
  await expect(pick.locator(`[data-pick="${bears}"]`)).toHaveClass(/dim/);
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[ring]!.zone).toBe("battlefield");
  expect(after.objects[stone]!.zone).toBe("battlefield");
  expect([after.objects[bears]!.zone, after.objects[giant]!.zone, after.objects[shock]!.zone]).toEqual(["graveyard", "graveyard", "graveyard"]);
  expect(idsOf(after, "Queen Kayla bin-Kroog", "battlefield", 0).length).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
