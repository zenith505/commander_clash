// Lane B round B180 in the browser: Nafs Asp's "loses 1 life at the beginning of their next draw step unless they pay {1}
// before that draw step": your upkeep stops for it, and the "Pay {1} for Nafs Asp" button pays it (a special action).
import { expect, test } from "@playwright/test";
import { open, pageErrors, playUntil, scene, state } from "./scene";
import { controls, resolveUntil } from "./ui";
import { applyAction, waitingOn } from "@cc/engine";

test("Nafs Asp: Ana's Asp hits you; in your upkeep pay {1} with a Forest and lose no more life", async ({ page }) => {
  let s = scene({ board: ["Forest"] }, [{ board: ["Nafs Asp"] }]);
  const asp = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Nafs Asp")!;
  s = playUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.activePlayer === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: asp, defender: 0 }] });
  s = playUntil(s, (x) => x.step === "upkeep" && x.activePlayer === 0 && waitingOn(x) === 0 && !x.stack.length && !x.triggerQueue.length);
  expect(s.players[0]!.life).toBe(39);
  await open(page, s);
  const pay = controls(page).getByRole("button", { name: "Pay {1} for Nafs Asp" });
  await expect(pay).toBeEnabled();
  await pay.click();
  await expect.poll(async () => (await state(page)).delayed?.some((d) => d.unlessPaid) ?? false).toBe(false);
  await expect(pay).toHaveCount(0);
  // Pass until your first main phase of this turn: resolveUntil clicks Pass only once the game has settled on you, so a
  // click can't land after the game has moved on by itself (it moved past main1 to main2 that way, follow-up 19). The
  // state it saw there is the one checked.
  const after = await resolveUntil(page, (st) => st.turn === s.turn && st.activePlayer === 0 && st.step === "main1" && !st.stack.length);
  expect(after.players[0]!.life).toBe(39);
  expect(pageErrors(page)).toEqual([]);
});
