// Round 327's prompts: Retraced Image asks which card of your hand to reveal (one named like a permanent is put onto the
// battlefield); Wild Pair asks whether to search when you cast a creature from your hand, then offers only creature
// cards with the same total power and toughness.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, modal, resolveUntil } from "./ui";

test("Retraced Image: reveal Llanowar Elves, named like your Llanowar Elves, and it enters; Hill Giant stays in hand", async ({ page }) => {
  let s: GameState = scene({ hand: ["Retraced Image", "Hill Giant", "Llanowar Elves"], board: [...LANDS, "Llanowar Elves"] });
  const [spell, giant] = [one(s, "Retraced Image"), one(s, "Hill Giant")];
  const elves = s.players[0]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Llanowar Elves")!;
  for (const a of planCast(s, 0, spell)!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  expect(s.pending).toMatchObject({ fromHand: true, min: 1, max: 1 });
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("a card to reveal");
  await pick.locator(`[data-pick="${elves}"]`).first().click();
  await pick.getByRole("button", { name: "Reveal", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[spell]!.zone === "graveyard");
  expect(after.objects[elves]!.zone).toBe("battlefield");
  expect(after.objects[giant]!.zone).toBe("hand");
  expect(after.log.some((l) => /reveals Llanowar Elves/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Wild Pair: cast Grizzly Bears, say yes, and find Gray Ogre (2/2) but not Hill Giant (3/3)", async ({ page }) => {
  let s: GameState = scene({ hand: ["Grizzly Bears"], board: [...LANDS, "Wild Pair"], library: ["Gray Ogre", "Hill Giant"] });
  const [bears, ogre, giant] = [one(s, "Grizzly Bears"), one(s, "Gray Ogre"), one(s, "Hill Giant")];
  for (const a of planCast(s, 0, bears)!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "chooseMay" && x.pending.player === 0);
  await open(page, s);
  await expect(controls(page)).toContainText("Wild Pair");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  expect(st.pending?.kind === "searchLibrary" && st.pending.cards).not.toContain(giant);
  const pick = modal(page);
  await expect(pick).toContainText("total power and toughness 4");
  await pick.locator(`[data-pick="${ogre}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[ogre]!.zone === "battlefield");
  expect(after.objects[giant]!.zone).toBe("library");
  expect(pageErrors(page)).toEqual([]);
});
