// Round 397 in the browser: The Spot, Living Portal's two targets (Ana's Oblivion Ring, then her Serra Angel card from a
// graveyard); Tetsuo, Imperial Champion's attack trigger, each mode (damage to Ana, then a free Divination from your
// hand); Absorbing Man's first-main-phase target (Ana's Sol Ring) and the copy he becomes; Jeskai Infiltrator manifested
// with your top card after its combat damage.
import { expect, test } from "@playwright/test";
import { characteristics, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

const ch = (s: GameState, id: string) => characteristics(s, s.objects[id]!);

test("The Spot, Living Portal: exile Ana's Oblivion Ring and her Serra Angel card from her graveyard", async ({ page }) => {
  const s = scene({ hand: ["The Spot, Living Portal"], board: LANDS }, [{ board: ["Oblivion Ring"], yard: ["Serra Angel", "Island"] }]);
  const [ring, angel, island] = [one(s, "Oblivion Ring"), one(s, "Serra Angel"), s.players[1]!.graveyard.find((id) => id !== one(s, "Serra Angel"))!];
  await open(page, s);
  await card(page, "The Spot, Living Portal", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("nonland permanent");
  await page.locator(`[data-obj="${ring}"]`).first().click();
  // The second target, a card: the graveyard picker opens. Only nonland permanent cards: the Angel, not the Island.
  const pick = modal(page);
  await expect(pick).toContainText("nonland permanent card from a graveyard");
  await expect(pick.locator(`[data-pick="${angel}"]`)).toBeVisible();
  await expect(pick.locator(`[data-pick="${island}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${angel}"]`).click();
  await expect(modal(page)).toHaveCount(0);
  if (await bar.getByRole("button", { name: "Done" }).count()) await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[angel]!.zone === "exile");
  expect(after.objects[ring]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Tetsuo, Imperial Champion: attacking equipped, its first mode deals 3 damage to Ana (Loxodon Warhammer)", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Tetsuo, Imperial Champion", "Bonesplitter", "Loxodon Warhammer"] });
  const [tetsuo, bs, wh] = [one(s, "Tetsuo, Imperial Champion"), one(s, "Bonesplitter"), one(s, "Loxodon Warhammer")];
  s.objects[bs]!.attachedTo = tetsuo;
  s.objects[wh]!.attachedTo = tetsuo;
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await attack(page, [[tetsuo, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseModes" && st.pending.player === 0);
  await page.locator(".mode-menu").getByRole("button", { name: /deals damage equal to the greatest mana value among Equipment attached to it/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life < 40);
  // 3 from the trigger before combat damage.
  expect(after.players[1]!.life).toBe(37);
  expect(pageErrors(page)).toEqual([]);
});

test("Tetsuo, Imperial Champion: its second mode casts Divination from your hand free, Lava Axe isn't offered", async ({ page }) => {
  const s = scene({ hand: ["Divination", "Lava Axe"], board: [...LANDS, "Tetsuo, Imperial Champion", "Loxodon Warhammer"] });
  const [tetsuo, wh, div, axe] = [one(s, "Tetsuo, Imperial Champion"), one(s, "Loxodon Warhammer"), one(s, "Divination"), one(s, "Lava Axe")];
  s.objects[wh]!.attachedTo = tetsuo;
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await attack(page, [[tetsuo, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseModes" && st.pending.player === 0);
  await page.locator(".mode-menu").getByRole("button", { name: /You may cast an instant or sorcery spell from your hand/ }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromHand" && st.pending.player === 0);
  const options = asked.pending?.kind === "chooseOption" ? asked.pending.options : [];
  expect(options).toContain(div);
  expect(options).not.toContain(axe);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Lava Axe" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Divination" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: /^Cast/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "graveyard");
  // Divination left the hand and drew two.
  expect(after.players[0]!.hand.length).toBe(hand + 1);
  expect(pageErrors(page)).toEqual([]);
});

test("Absorbing Man: at your first main phase, target Ana's Sol Ring; he's a legendary 4/4 Human Villain artifact creature named Absorbing Man", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Absorbing Man"] }, [{ board: ["Sol Ring"] }], { step: "upkeep" });
  const [am, ring] = [one(s, "Absorbing Man"), one(s, "Sol Ring")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("artifact, non-Aura enchantment, or land");
  await page.locator(`[data-obj="${ring}"]`).first().click();
  if (await bar.getByRole("button", { name: "Done" }).count()) await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && ch(st, am).types.includes("Artifact"));
  const c = ch(after, am);
  expect(c.name).toBe("Absorbing Man");
  expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
  expect(c.subtypes).toEqual(expect.arrayContaining(["Human", "Villain"]));
  expect(c.keywords).toContain("Vigilance");
  await expect(page.locator(`[data-obj="${am}"]`).first()).toContainText("4/4");
  expect(pageErrors(page)).toEqual([]);
});

test("Jeskai Infiltrator: unblocked combat damage to Ana, then it and your top card are manifested face down", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Jeskai Infiltrator"], library: ["Hill Giant"] });
  const [ji, giant] = [one(s, "Jeskai Infiltrator"), one(s, "Hill Giant")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await attack(page, [[ji, 1]]);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield", 80);
  expect(after.players[1]!.life).toBe(38);
  for (const id of [ji, giant]) expect(after.objects[id]).toMatchObject({ zone: "battlefield", controller: 0 });
  expect(after.objects[ji]!.faceDown).toBeTruthy();
  expect(after.objects[giant]!.faceDown).toBeTruthy();
  expect(pageErrors(page)).toEqual([]);
});
