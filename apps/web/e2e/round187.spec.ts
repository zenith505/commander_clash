// Round 187's prompt: Visions of Dread cast at you. You choose a creature card in your graveyard, and it enters under the
// caster's control.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { modal, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes (declaring no attackers or blockers) until Ana's first main phase. */
const toAnasMain = (s: GameState) => {
  for (let i = 0; i < 200 && !(s.activePlayer === 1 && s.step === "main1" && !s.stack.length); i++) {
    const p = s.pending;
    if (p?.kind === "declareAttackers") s = applyAction(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p?.kind === "declareBlockers") s = applyAction(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Visions of Dread cast at you: you pick the creature card, and it enters under the caster's control", async ({ page }) => {
  const s0 = scene({ yard: ["Grizzly Bears", "Hill Giant", "Shock"] }, [{ board: [...LANDS], hand: ["Visions of Dread"] }]);
  const [bears, giant, shock] = [one(s0, "Grizzly Bears"), one(s0, "Hill Giant"), one(s0, "Shock")];
  const s1 = toAnasMain(s0);
  expect(s1.activePlayer).toBe(1);
  const s = passToPrompt(run(s1, planCast(s1, 1, one(s1, "Visions of Dread"), [{ kind: "player", id: 0 }])));
  expect(s.pending).toMatchObject({ kind: "searchLibrary", player: 0, under: 1 });
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("Visions of Dread: put a creature card from your graveyard onto the battlefield under Ana's control");
  await expect(pick.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!).toMatchObject({ zone: "battlefield", controller: 1, owner: 0 });
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
