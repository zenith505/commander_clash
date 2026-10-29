// Round 209: "You may pay {1}{W} any number of times" (Intrepid Adversary): how many times first, as many as you could
// pay, then the payment.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, power, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Intrepid Adversary: pay {1}{W} twice, two valor counters pump your creatures", async ({ page }) => {
  let s: GameState = scene({ hand: ["Intrepid Adversary"], board: [...LANDS, "Grizzly Bears"] });
  const adv = one(s, "Intrepid Adversary");
  const bears = one(s, "Grizzly Bears");
  for (const a of planCast(s, 0, adv)!) s = applyAction(s, a);
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "payX" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("pay {1}{W} how many times?");
  // Three Plains, one tapped for the Adversary: twice at most.
  await expect(bar.getByRole("button", { name: /^3 times/ })).toHaveCount(0);
  await bar.getByRole("button", { name: "2 times ({2}{W}{W})" }).click();
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[adv]!.counters.valor === 2);
  expect(power(after, after.objects[bears]!)).toBe(4);
  expect(pageErrors(page)).toEqual([]);
});
