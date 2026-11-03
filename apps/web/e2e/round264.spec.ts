// Round 264: Eventide's Shadow removes counters you pick one at a time from any player's permanents, then you draw that
// many cards and lose that much life.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Eventide's Shadow: pick counters from any permanents, then draw and lose life for each", async ({ page }) => {
  const s = scene({ hand: ["Eventide's Shadow"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[giant]!.counters = { "+1/+1": 2 };
  s.objects[bears]!.counters = { stun: 1 };
  const hand = s.players[0]!.hand.length;
  const life = s.players[0]!.life;
  await open(page, s);
  await card(page, "Eventide's Shadow", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "removeCounter");
  const bar = controls(page);
  await expect(bar).toContainText("choose a counter to remove (0 so far)");
  await bar.getByRole("button", { name: "A +1/+1 counter from Hill Giant (2 left)" }).click();
  await expect(bar).toContainText("(1 so far)");
  await bar.getByRole("button", { name: "A stun counter from Grizzly Bears (1 left)" }).click();
  await expect(bar).toContainText("(2 so far)");
  await bar.getByRole("button", { name: "That's all" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.life === life - 2);
  expect(after.objects[giant]!.counters["+1/+1"]).toBe(1);
  expect(after.objects[bears]!.counters.stun ?? 0).toBe(0);
  // The spell left the hand; two cards were drawn.
  expect(after.players[0]!.hand.length).toBe(hand - 1 + 2);
  expect(pageErrors(page)).toEqual([]);
});
