// Lane B round B280 in the browser: Filigree Vector's enters trigger asks for two groups of targets, the creatures first,
// then the artifacts, Done after each; the Vector itself is in both. Lich's Mirror asks which of your permanents dying in
// the same check go to the graveyard instead of your library.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, resolveUntil } from "./ui";
import { applyAction, planActivate, type GameState } from "@cc/engine";

/** The state once `done` holds (polled), kept: no second read after it. */
async function settled(page: Parameters<typeof state>[0], done: (s: GameState) => boolean): Promise<GameState> {
  let s: GameState | undefined;
  await expect.poll(async () => done((s = await state(page)))).toBe(true);
  return s!;
}

test("Filigree Vector: +1/+1 counters on the Vector and Ornithopter, charge counters on the Vector and Sol Ring", async ({ page }) => {
  const s = scene({ hand: ["Filigree Vector"], board: [...LANDS, "Ornithopter", "Sol Ring"] }, [{ board: ["Grizzly Bears", "Mind Stone"] }]);
  const [vector, thopter, ring, bears, stone] = [one(s, "Filigree Vector"), one(s, "Ornithopter"), one(s, "Sol Ring"), one(s, "Grizzly Bears"), one(s, "Mind Stone")];
  await open(page, s);
  await card(page, "Filigree Vector", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  const bar = page.locator(".targeting");
  // The Vector, Ornithopter and Grizzly Bears could get a +1/+1 counter.
  await expect(bar).toContainText("choose target creature (optional, up to 3 more)");
  await page.locator(`[data-obj="${vector}"]`).first().click();
  await page.locator(`[data-obj="${thopter}"]`).first().click();
  await bar.getByRole("button", { name: "Done" }).click();
  // Then the artifacts: the Vector, Ornithopter, Sol Ring and Mind Stone.
  await expect(bar).toContainText("choose target artifact (optional, up to 4 more)");
  await page.locator(`[data-obj="${vector}"]`).first().click();
  await page.locator(`[data-obj="${ring}"]`).first().click();
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[ring]!.counters.charge ?? 0) === 1);
  expect(after.objects[vector]!.counters).toMatchObject({ "+1/+1": 1, charge: 1 });
  expect(after.objects[thopter]!.counters["+1/+1"]).toBe(1);
  expect(after.objects[thopter]!.counters.charge ?? 0).toBe(0);
  expect(after.objects[bears]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(after.objects[stone]!.counters.charge ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Lich's Mirror: Pestilence takes you to 0 life and kills your Llanowar Elves; you send the Elves to the graveyard", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Pestilence", "Lich's Mirror", "Llanowar Elves"], life: 1 });
  const [pest, mirror, elves] = [one(s, "Pestilence"), one(s, "Lich's Mirror"), one(s, "Llanowar Elves")];
  for (const a of planActivate(s, 0, pest, 0)!) s = applyAction(s, a);
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await expect(controls(page)).toContainText("Lich's Mirror: you would lose the game, so your hand, graveyard and permanents are shuffled into your library instead.");
  await expect(controls(page)).toContainText("click the ones that go to the graveyard instead (the rest are shuffled in)");
  const button = controls(page).getByRole("button", { name: "Choose none" });
  await expect(button).toBeEnabled();
  await page.locator(`[data-obj="${elves}"]`).first().click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  const after = await settled(page, (x) => !x.pending && x.players[0]!.life === 20);
  expect(after.players[0]!.lost).toBeFalsy();
  expect(after.objects[elves]!.zone).toBe("graveyard");
  expect(["library", "hand"]).toContain(after.objects[mirror]!.zone);
  expect(after.objects[pest]!.zone === "library" || after.objects[pest]!.zone === "hand").toBe(true);
  expect(after.players[0]!.hand.length).toBe(7);
  expect(pageErrors(page)).toEqual([]);
});
