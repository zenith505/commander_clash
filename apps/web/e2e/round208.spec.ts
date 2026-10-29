// Round 208: "When this creature dies, you may cast it from your graveyard as an Adventure until the end of your next
// turn" (Mosswood Dreadknight): the graveyard view offers the Adventure half only, and casting it exiles the card.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { menu, modal, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Mosswood Dreadknight: dies, then cast Dread Whispers from your graveyard", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Mosswood Dreadknight // Dread Whispers"], hand: ["Murder"] });
  const knight = one(s0, "Mosswood Dreadknight");
  const s = settle(run(s0, planCast(s0, 0, one(s0, "Murder"), [{ kind: "object", id: knight }])));
  expect(s.objects[knight]!.zone).toBe("graveyard");
  expect(s.objects[knight]!.mayPlay).toMatchObject({ until: "nextTurn", face: 1 });
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Mosswood Dreadknight" }).click();
  // Only the Adventure: no button casts the creature from the graveyard.
  await expect(menu(page).getByRole("button", { name: /^Cast from graveyard/ })).toHaveCount(1);
  await menu(page).getByRole("button", { name: /^Cast from graveyard Dread Whispers/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[knight]!.zone === "exile");
  expect(after.players[0]!.hand.length).toBe(hand + 1);
  expect(pageErrors(page)).toEqual([]);
});
