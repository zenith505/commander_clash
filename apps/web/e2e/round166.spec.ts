// Round 166: Lonis, Cryptozoologist digs into an opponent's library: you take a permanent card from among the cards they
// reveal, and the rest go to the bottom of their library.
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { modal, resolveUntil } from "./ui";

test("Lonis sacrifices two Clues: take Grizzly Bears from the top two cards of Ana's library; Hill Giant goes to her bottom", async ({ page }) => {
  let s: GameState = scene({ board: [...LANDS, "Lonis, Cryptozoologist"], tokens: ["Clue", "Clue"] }, [{ library: ["Grizzly Bears", "Hill Giant"] }]);
  const [lonis, bears, giant] = [one(s, "Lonis, Cryptozoologist"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  const clues = s.battlefield.filter((id) => s.objects[id]!.isToken);
  // Activated with X = 2 targeting Ana; the scene starts as it resolves.
  for (const a of planActivate(s, 0, lonis, 0, [{ kind: "player", id: 1 }], undefined, undefined, 2, { sacrifice: clues })!) s = applyAction(s, a);
  for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary"; i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  expect(s.pending).toMatchObject({ kind: "searchLibrary", player: 0, cards: [bears] });
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("Lonis, Cryptozoologist: put a nonland permanent card with mana value 2 or less onto the battlefield");
  await expect(pick).toContainText(`The rest go on the bottom of ${s.players[1]!.name}'s library.`);
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(after.players[1]!.library.at(-1)).toBe(giant);
  expect(pageErrors(page)).toEqual([]);
});
