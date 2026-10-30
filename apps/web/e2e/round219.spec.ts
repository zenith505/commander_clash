// Round 219 in the browser: Denry Klin's choice of three counters as it enters (CR 614.1c, 614.12), and casting a
// creature for free at instant speed through an opponent's Aluren (CR 118.9, 702.8a).
import { expect, test } from "@playwright/test";
import { waitingOn } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Denry Klin: choose a first strike counter out of three as it enters", async ({ page }) => {
  const s = scene({ hand: ["Denry Klin, Editor in Chief"], board: LANDS });
  const denry = one(s, "Denry Klin, Editor in Chief");
  await open(page, s);
  await card(page, "Denry Klin, Editor in Chief", s).click();
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "A +1/+1 counter" })).toHaveCount(1);
  await expect(bar.getByRole("button", { name: "A vigilance counter" })).toHaveCount(1);
  await bar.getByRole("button", { name: "A first strike counter" }).click();
  // Denry is a nontoken creature you control entering, and has a counter by then: its own trigger doubles it.
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[denry]!.counters["first strike"] === 2);
  expect(after.objects[denry]!.zone).toBe("battlefield");
  expect(after.objects[denry]!.counters).toEqual({ "first strike": 2 });
  expect(pageErrors(page)).toEqual([]);
});

test("Aluren: cast Grizzly Bears for free in Ana's end step with no lands, through Ana's Aluren", async ({ page }) => {
  let s = scene({ hand: ["Grizzly Bears"] }, [{ board: ["Aluren"] }]);
  const bears = one(s, "Grizzly Bears");
  // Ana's end step, in the engine, with you holding priority.
  s = playUntil(s, (st) => st.activePlayer === 1 && st.step === "end" && !st.pending && waitingOn(st) === 0);
  await open(page, s);
  await card(page, "Grizzly Bears", s).click();
  await menu(page).locator("button:enabled", { hasText: "Cast it for" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect([after.activePlayer, after.step]).toEqual([1, "end"]);
  expect(pageErrors(page)).toEqual([]);
});
