// Round 162: Perplex's "unless its controller discards their hand" prompt, and the cycling Rhet-Tomb Mystic gives the
// creature cards in your hand.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type GameState, type TargetChoice } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

/** You cast Grizzly Bears; Ana answers with Perplex, which waits on your choice. */
function perplexed(): { s: GameState; bears: string; giant: string } {
  let s = scene({ hand: ["Grizzly Bears", "Hill Giant"], board: LANDS }, [{ hand: ["Perplex"], board: ["Island", "Island", "Swamp"] }]);
  const [bears, giant, perplex] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Perplex")];
  for (const a of planCast(s, 0, bears)!) s = applyAction(s, a);
  s = applyAction(s, { type: "passPriority", player: 0 });
  for (const a of planCast(s, 1, perplex, [{ kind: "stack", id: s.stack[0]!.id } as TargetChoice])!) s = applyAction(s, a);
  for (let i = 0; i < 8 && !s.pending; i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return { s, bears, giant };
}

test("Perplex: discard your hand to keep your spell", async ({ page }) => {
  const { s, bears, giant } = perplexed();
  expect(s.pending).toMatchObject({ kind: "payUnless", player: 0, discardHand: true });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Perplex: discard your hand or Grizzly Bears is countered.");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.players[0]!.hand).toHaveLength(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Perplex: don't discard, and the spell is countered", async ({ page }) => {
  const { s, bears, giant } = perplexed();
  await open(page, s);
  await controls(page).getByRole("button", { name: "Don't pay" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Rhet-Tomb Mystic: cycle a creature card from your hand", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant", "Divination"], board: [...LANDS, "Rhet-Tomb Mystic"], library: ["Gray Ogre"] });
  const [giant, ogre] = [one(s, "Hill Giant"), one(s, "Gray Ogre")];
  await open(page, s);
  await card(page, "Hill Giant", s).click();
  await menu(page).getByRole("button", { name: /^Cycling/ }).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "graveyard" && st.stack.length === 0 && !st.pending);
  expect(after.players[0]!.hand).toContain(ogre);
  expect(after.players[0]!.hand).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});
