// Round 361: Vislor Turlough's enters trigger ("you may have an opponent gain control of it"), answered Yes, then the
// opponent chosen with a button for each; it's theirs, goaded by you. Resplendent Marshal's "you may exile another
// creature card from your graveyard", answered Yes, then the card picked; the reflexive ability puts a +1/+1 counter on
// your creatures that share a creature type with it.
import { expect, test } from "@playwright/test";
import type { GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Vislor Turlough: Yes, then choose Ben: Ben controls it, goaded by you", async ({ page }) => {
  const s = scene({ hand: ["Vislor Turlough"], board: LANDS });
  const v = one(s, "Vislor Turlough");
  await open(page, s);
  await card(page, "Vislor Turlough", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  expect(asked.objects[v]!.zone).toBe("battlefield");
  await expect(controls(page)).toContainText("Have an opponent gain control of Vislor Turlough?");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent");
  const bar = controls(page);
  for (const name of ["Ana", "Ben", "Cy"]) await expect(bar.getByRole("button", { name, exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  // Ben's control-changing effect, and your goad for as long as Ben controls it.
  const given = (st: GameState) => st.effects.some((e) => e.affected.includes(v) && e.controller === 2 && e.mods.some((m) => m.kind === "control"));
  const goaded = (st: GameState) => st.effects.some((e) => e.affected.includes(v) && e.controller === 0 && e.mods.some((m) => m.kind === "goad") && e.whileControlled?.controller === 2);
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && given(st) && goaded(st));
  expect(after.objects[v]!.zone).toBe("battlefield");
  expect(after.log.some((l) => /Ben gains control of Vislor Turlough|Vislor Turlough.*Ben/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Resplendent Marshal: Yes, pick the Elf card in your graveyard; your other Elf gets a +1/+1 counter", async ({ page }) => {
  const s = scene({ hand: ["Resplendent Marshal"], board: [...LANDS, "Llanowar Elves", "Savannah Lions"], yard: ["Llanowar Elves", "Savannah Lions"] });
  const [marshal, lions] = [one(s, "Resplendent Marshal"), idsOf(s, "Savannah Lions", "battlefield", 0)[0]!];
  const [elf, elfCard] = [idsOf(s, "Llanowar Elves", "battlefield", 0)[0]!, idsOf(s, "Llanowar Elves", "graveyard", 0)[0]!];
  await open(page, s);
  await card(page, "Resplendent Marshal", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const pick = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  // Chosen as it resolves: either creature card in your graveyard.
  expect((pick.pending as { cards: string[] }).cards).toContain(elfCard);
  await modal(page).locator(`[data-pick="${elfCard}"]`).click();
  if (await modal(page).getByRole("button", { name: "Done" }).count()) await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.triggerQueue.length === 0 && st.objects[elfCard]!.zone === "exile" && (st.objects[elf]!.counters["+1/+1"] ?? 0) === 1);
  expect(after.objects[lions]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(after.objects[marshal]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
