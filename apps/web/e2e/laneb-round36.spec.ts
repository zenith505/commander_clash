// Lane B round 36's prompt: Misinformation puts cards from an opponent's graveyard on top of that player's library,
// and its caster, not their owner, orders them.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Misinformation on three of Ana's cards: you order them on top of Ana's library", async ({ page }) => {
  const s0 = scene({ board: [...LANDS], hand: ["Misinformation"] }, [{ yard: ["Hill Giant", "Grizzly Bears", "Forest"] }]);
  const picked = ["Hill Giant", "Grizzly Bears", "Forest"].map((n) => idsOf(s0, n, "graveyard", 1)[0]!);
  const s = passToPrompt(run(s0, planCast(s0, 0, one(s0, "Misinformation"), picked.map((id) => ({ kind: "object" as const, id })))));
  expect(s.pending).toMatchObject({ kind: "orderLibrary", player: 0, owner: 1 });
  const start = s.pending?.kind === "orderLibrary" ? s.pending.cards : [];
  expect(new Set(start)).toEqual(new Set(picked));
  await open(page, s);
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("Misinformation");
  await expect(arrange).toContainText("Ana's library");
  // Move the last card toward the top twice: it ends up on top.
  for (let i = 0; i < 2; i++) await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${start[2]}"]`) }).getByRole("button", { name: "Move toward the top" }).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && picked.every((id) => x.objects[id]!.zone === "library"));
  expect(after.players[1]!.library.slice(0, 3)).toEqual([start[2], start[0], start[1]]);
  expect(after.players[0]!.library).not.toContain(start[0]);
  expect(pageErrors(page)).toEqual([]);
});
