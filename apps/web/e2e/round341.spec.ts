// Round 341's prompt: an optional token replacement, asked as the tokens would be created (CR 616.1): Jinnie Fay's Cats
// or Dogs instead, Esix's copies of a creature chosen among everyone's, and declining Moonlit Meditation's copies.
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, invalidateCharacteristics, planCast, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

/** You cast `spell` in the engine and play on until the token question is yours. */
function castScene(s0: GameState, spell: string) {
  let s = s0;
  for (const a of planCast(s, 0, idsOf(s, spell, "hand", 0)[0]!)!) s = applyAction(s, a);
  return playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "tokenInstead" && st.pending.player === 0);
}
const yourTokens = (st: GameState) => st.battlefield.filter((id) => st.objects[id]!.isToken && st.objects[id]!.controller === 0).map((id) => characteristics(st, st.objects[id]!).name).sort();

test("Jinnie Fay: Raise the Alarm's Soldiers become two Cats with haste", async ({ page }) => {
  const s = castScene(scene({ hand: ["Raise the Alarm"], board: [...LANDS, "Jinnie Fay, Jetmir's Second"] }), "Raise the Alarm");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Jinnie Fay, Jetmir's Second: you would create 2 Soldier tokens. Create other tokens instead?");
  await expect(bar.getByRole("button", { name: "No, create the 2 Soldier tokens" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Create 2 3/1 green Dog creature tokens with vigilance" })).toBeVisible();
  await bar.getByRole("button", { name: "Create 2 2/2 green Cat creature tokens with haste" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && yourTokens(st).length === 2);
  expect(yourTokens(after)).toEqual(["Cat Token", "Cat Token"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Esix: Krenko's Command's Goblins become copies of Ana's Grizzly Bears", async ({ page }) => {
  const s = castScene(scene({ hand: ["Krenko's Command"], board: [...LANDS, "Esix, Fractal Bloom"] }, [{ board: ["Grizzly Bears"] }]), "Krenko's Command");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Esix, Fractal Bloom: you would create 2 Goblin tokens. Create other tokens instead?");
  await bar.getByRole("button", { name: "Create 2 tokens that are copies of Grizzly Bears (Ana's)" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && yourTokens(st).length === 2);
  expect(yourTokens(after)).toEqual(["Grizzly Bears", "Grizzly Bears"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Moonlit Meditation on your Ornithopter: decline, and the Soldiers are made as they are", async ({ page }) => {
  const s0 = scene({ hand: ["Raise the Alarm"], board: [...LANDS, "Ornithopter", "Moonlit Meditation"] });
  s0.objects[one(s0, "Moonlit Meditation")]!.attachedTo = one(s0, "Ornithopter");
  invalidateCharacteristics(s0);
  const s = castScene(s0, "Raise the Alarm");
  await open(page, s);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Create 2 tokens that are copies of Ornithopter" })).toBeVisible();
  await bar.getByRole("button", { name: "No, create the 2 Soldier tokens" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && yourTokens(st).length === 2);
  expect(yourTokens(after)).toEqual(["Soldier Token", "Soldier Token"]);
  expect(pageErrors(page)).toEqual([]);
});
