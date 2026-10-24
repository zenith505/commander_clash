// Round 145's prompts: an opponent's Nicol Bolas, Dragon-God +1 asks you to exile a card from your hand or a permanent
// you control, after the opponents before you in turn order have chosen (rulings).
import { expect, test } from "@playwright/test";
import { applyAction, botActions, planActivate, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Nicol Bolas, Dragon-God's +1 on Ana's turn: you pick Hill Giant from your permanents and it's exiled", async ({ page }) => {
  let s: GameState = scene({ hand: ["Grizzly Bears"], board: ["Hill Giant"] }, [{ board: [...LANDS, "Nicol Bolas, Dragon-God"] }]);
  const [bolas, giant, bears] = [one(s, "Nicol Bolas, Dragon-God"), one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  s.objects[bolas]!.counters.loyalty = 4;
  // On to Ana's first main phase, where she activates his +1; Ben and Cy have nothing to exile.
  for (let i = 0; i < 400 && !(s.activePlayer === 1 && s.step === "main1" && !s.stack.length && !s.pending && waitingOn(s) === 1); i++) {
    const pid = waitingOn(s)!;
    s = applyAction(s, pid === 0 ? (s.pending?.player === 0 ? botActions(s, 0)[0]! : { type: "passPriority", player: 0 }) : botActions(s, pid)[0]!);
  }
  for (const a of planActivate(s, 1, bolas, 0)!) s = applyAction(s, a);
  for (let i = 0; i < 40 && !(s.pending?.player === 0); i++) {
    const pid = waitingOn(s)!;
    s = applyAction(s, pid === 0 ? { type: "passPriority", player: 0 } : botActions(s, pid)[0]!);
  }
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "exileHandOrPermanent", player: 0 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Nicol Bolas, Dragon-God: exile a card from your hand or a permanent you control");
  await expect(bar.getByRole("button", { name: "Grizzly Bears (hand)" })).toBeVisible();
  await bar.getByRole("button", { name: "Hill Giant" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(after.objects[bolas]!.counters.loyalty).toBe(5);
  expect(pageErrors(page)).toEqual([]);
});
