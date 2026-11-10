// Round 324's prompts: Masako the Humorless lets you click one of your tapped creatures to block with it; Belbe's Portal
// offers only the creature cards of the type chosen as it entered from your hand.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";
import { applyAction, type GameState } from "@cc/engine";

test("Masako the Humorless: your tapped Grizzly Bears blocks Ana's Hill Giant", async ({ page }) => {
  let s: GameState = scene({ board: ["Masako the Humorless", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[bears]!.tapped = true;
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: giant, defender: 0 }] });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 0);
  // The Bears untapped during your untap step (it's Ana's turn now): tap it again before the blocks.
  s.objects[bears]!.tapped = true;
  await open(page, s);
  await expect(controls(page)).toContainText("Click one of your creatures, then the attacker it blocks.");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await controls(page).getByRole("button", { name: "Block with 1" }).click();
  const after = await resolveUntil(page, (st) => st.pending?.kind !== "declareBlockers" && st.objects[bears]!.blocking !== undefined);
  expect(after.objects[bears]!.blocking).toEqual([giant]);
  expect(after.objects[bears]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Belbe's Portal (Elf chosen): only Llanowar Elves is offered from your hand, and it enters", async ({ page }) => {
  const s = scene({ hand: ["Llanowar Elves", "Grizzly Bears"], board: [...LANDS, "Belbe's Portal"] });
  const [portal, elves, bears] = [one(s, "Belbe's Portal"), one(s, "Llanowar Elves"), one(s, "Grizzly Bears")];
  s.objects[portal]!.chosen = { type: "Elf" };
  await open(page, s);
  await card(page, "Belbe's Portal", s).click();
  await menu(page).locator("button", { hasText: "You may put a creature card of the chosen type" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${bears}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${elves}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.objects[elves]!.zone === "battlefield" && !st.pending && st.stack.length === 0);
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
