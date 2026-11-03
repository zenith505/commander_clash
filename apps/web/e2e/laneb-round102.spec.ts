// Lane B round 102 in the browser: Noggin Whack's "Target player reveals three cards from their hand. You choose two of
// them. That player discards those cards.": Ana reveals three of her choice, you click two of them, then Done.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, menu, modal, resolveUntil } from "./ui";

test("Noggin Whack: target Ana, she reveals three cards, you pick two of them for her to discard", async ({ page }) => {
  const s = scene({ hand: ["Noggin Whack"], board: LANDS }, [{ hand: ["Divination", "Grizzly Bears", "Hill Giant", "Llanowar Elves"] }]);
  const ana = ["Divination", "Grizzly Bears", "Hill Giant", "Llanowar Elves"].map((n) => one(s, n));
  await open(page, s);
  await card(page, "Noggin Whack", s).click();
  // Its prowl cost isn't available (no Rogue dealt combat damage this turn): cast it for its mana cost.
  await menu(page).getByRole("button", { name: /^Cast it/ }).click();
  await clickPlayer(page, 1);
  const st = await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  const shown = (st.pending as { cards: string[] }).cards;
  expect(shown).toHaveLength(3);
  expect(shown.every((id) => ana.includes(id))).toBe(true);
  const pick = modal(page);
  await pick.locator(`[data-pick="${shown[0]}"]`).click();
  await pick.locator(`[data-pick="${shown[2]}"]`).click();
  await pick.getByRole("button", { name: "Done", exact: true }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[shown[0]!]!.zone === "graveyard");
  expect([shown[0], shown[1], shown[2]].map((id) => after.objects[id!]!.zone)).toEqual(["graveyard", "hand", "graveyard"]);
  expect(after.players[1]!.hand).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});
