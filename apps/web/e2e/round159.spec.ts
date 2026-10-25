// Round 159: Memory Plunder casts target instant or sorcery card from an opponent's graveyard without paying its mana
// cost: pick Ana's Divination as the spell's target, then cast it for free as Memory Plunder resolves.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Memory Plunder: cast Divination from an opponent's graveyard for free", async ({ page }) => {
  const s = scene({ hand: ["Memory Plunder"], board: LANDS, library: ["Plains", "Island", "Swamp"] }, [{ yard: ["Divination", "Grizzly Bears"] }]);
  const [divination, bears] = [one(s, "Divination"), one(s, "Grizzly Bears")];
  const handBefore = s.players[0]!.hand.length;
  await open(page, s);
  await card(page, "Memory Plunder", s).click();
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${bears}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${divination}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree");
  await expect(controls(page)).toContainText("cast Divination without paying its mana cost?");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[divination]!.zone === "graveyard");
  // Memory Plunder left the hand; Divination drew two. Divination goes back to its owner's graveyard (CR 400.3).
  expect(after.players[0]!.hand.length).toBe(handBefore - 1 + 2);
  expect(after.objects[divination]!.owner).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
