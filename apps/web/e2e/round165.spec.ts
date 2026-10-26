// Round 165: O-Kagachi Made Manifest attacking you: you choose which nonland card in its controller's graveyard goes back
// to their hand (and so how big it gets).
import { expect, test } from "@playwright/test";
import { applyAction, botActions, invalidateCharacteristics, power, waitingOn, type GameState } from "@cc/engine";
import { one, open, pageErrors, scene } from "./scene";
import { modal, resolveUntil } from "./ui";

test("O-Kagachi attacks you: pick the small card from Ana's graveyard; it returns to her hand and O-Kagachi gets +2/+0", async ({ page }) => {
  let s: GameState = scene({}, [{ board: ["The Kami War // O-Kagachi Made Manifest"], yard: ["Grizzly Bears", "Hill Giant", "Forest"] }]);
  const [kami, bears, giant] = [one(s, "The Kami War"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[kami]!.face = 1; // transformed (CR 712.8e)
  invalidateCharacteristics(s);
  // Your turn passes; on Ana's, O-Kagachi attacks you.
  for (let i = 0; i < 400 && !(s.pending?.kind === "searchLibrary" && s.pending.player === 0); i++) {
    const pid = waitingOn(s)!;
    const pend = s.pending;
    if (pend?.kind === "declareAttackers" && pid === 1) s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: kami, defender: 0 }] });
    else if (pid !== 0) s = applyAction(s, botActions(s, pid)[0]!);
    else if (pend?.kind === "declareAttackers") s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [] });
    else if (pend?.kind === "declareBlockers") s = applyAction(s, { type: "declareBlockers", player: 0, blocks: [] });
    else s = applyAction(s, { type: "passPriority", player: 0 });
  }
  expect(s.pending).toMatchObject({ kind: "searchLibrary", player: 0, forPlayer: 1, max: 1 });
  expect((s.pending as { cards: string[] }).cards.sort()).toEqual([bears, giant].sort());
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("O-Kagachi Made Manifest");
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[bears]!.zone === "hand");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(power(after, after.objects[kami]!)).toBe(8);
  expect(pageErrors(page)).toEqual([]);
});
