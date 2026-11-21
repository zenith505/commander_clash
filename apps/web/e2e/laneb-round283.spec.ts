// Lane B round B283 in the browser: Uvilda, Dean of Perfection (tap it: pick Concentrate from your hand to exile with three
// refine counters; when its last refine counter comes off at your upkeep, cast it for {4} less), Synthesis Pod (exile your
// Grizzly Bears from the stack: Ana reveals down to Divination, which you cast free) and The Dragon-Kami Reborn (chapter I's
// face-down pick with a hatching counter and the bottom order; the Egg dying casts the Shivan Dragon it hatched).
import { expect, test } from "@playwright/test";
import { applyAction, invalidateCharacteristics, planCast, setFace, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

const UVILDA = "Uvilda, Dean of Perfection // Nassari, Dean of Expression";
const DRAGON_KAMI = "The Dragon-Kami Reborn // Dragon-Kami's Egg";

/** The state once `done` holds (polled), kept: no second read after it. */
async function settled(page: Parameters<typeof state>[0], done: (s: GameState) => boolean): Promise<GameState> {
  let s: GameState | undefined;
  await expect.poll(async () => done((s = await state(page)))).toBe(true);
  return s!;
}

test("Uvilda, Dean of Perfection: tap it to exile Concentrate from your hand with three refine counters", async ({ page }) => {
  const s = scene({ hand: ["Concentrate", "Grizzly Bears"], board: [...LANDS, UVILDA] });
  const [uvilda, conc, bears] = [one(s, "Uvilda, Dean of Perfection"), one(s, "Concentrate"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${uvilda}"]`).first().click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /You may exile an instant or sorcery card from your hand/ }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  // Only instants and sorceries can be picked, and none may be chosen.
  expect(asked.pending?.kind === "searchLibrary" && asked.pending.cards).toEqual([conc]);
  expect(asked.pending?.kind === "searchLibrary" && asked.pending.min).toBe(0);
  // (The modal shows the whole hand; only the cards above can be picked.)
  const pick = modal(page);
  await pick.locator(`[data-pick="${conc}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await settled(page, (st) => !st.pending && st.stack.length === 0 && st.objects[conc]!.zone === "exile");
  expect(after.objects[conc]!.counters.refine).toBe(3);
  expect(after.objects[uvilda]!.tapped).toBe(true);
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Uvilda, Dean of Perfection: the last refine counter comes off at your upkeep; cast Concentrate for {U}{U}", async ({ page }) => {
  const s = scene({ board: [...LANDS, UVILDA], exile: ["Concentrate"] }, [], { step: "end" });
  const conc = one(s, "Concentrate");
  // Exiled by Uvilda on an earlier turn: one refine counter left on it.
  const c = s.objects[conc]!;
  c.counters.refine = 1;
  c.refined = c.zoneChanges ?? 0;
  invalidateCharacteristics(s);
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0, 80);
  const bar = controls(page);
  await expect(bar).toContainText("Concentrate: the last refine counter is gone. Cast it now for");
  await expect(bar).toContainText("(generic mana only)? If you don't, it stays in exile.");
  await bar.getByRole("button", { name: "Cast it", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[conc]!.zone === "graveyard");
  // Two Islands paid {U}{U}; the {2} came off.
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(2);
  // Three drawn (and the draw step's card, if the game got there).
  expect(after.players[0]!.hand.length).toBeGreaterThanOrEqual(hand + 3);
  expect(pageErrors(page)).toEqual([]);
});

test("Synthesis Pod: exile your Grizzly Bears from the stack; Ana reveals down to Divination, which you cast free", async ({ page }) => {
  let s = scene({ hand: ["Grizzly Bears"], board: [...LANDS, "Synthesis Pod"] }, [{ library: ["Lightning Bolt", "Divination"] }]);
  const [bears, pod, div, bolt] = [one(s, "Grizzly Bears"), one(s, "Synthesis Pod"), one(s, "Divination"), one(s, "Lightning Bolt")];
  for (const a of planCast(s, 0, bears)!) s = applyAction(s, a);
  expect(s.priority).toBe(0);
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await page.locator(`[data-obj="${pod}"]`).first().click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /Target opponent reveals cards/ }).click();
  // The target first, then the cost (CR 601.2c, 601.2h).
  await clickPlayer(page, 1);
  const pick = modal(page);
  await expect(pick).toContainText("exile a spell you control");
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("cast Divination without paying its mana cost?");
  await bar.getByRole("button", { name: "Cast it", exact: true }).click();
  const after = await settled(page, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("exile");
  expect(after.objects[bolt]!.zone).toBe("library");
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect(after.players[1]!.graveyard).toContain(div);
  expect(pageErrors(page)).toEqual([]);
});

test("The Dragon-Kami Reborn: chapter I exiles Shivan Dragon face down with a hatching counter; the rest go on the bottom", async ({ page }) => {
  const s = scene({ hand: [DRAGON_KAMI], board: LANDS, library: ["Shivan Dragon", "Lightning Bolt", "Grizzly Bears"] });
  const [saga, shivan, bolt, bears] = [one(s, "The Dragon-Kami Reborn"), one(s, "Shivan Dragon"), one(s, "Lightning Bolt"), one(s, "Grizzly Bears")];
  const life = s.players[0]!.life;
  await open(page, s);
  await card(page, "The Dragon-Kami Reborn", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(asked.pending?.kind === "searchLibrary" ? [...asked.pending.cards].sort() : []).toEqual([shivan, bolt, bears].sort());
  expect(asked.players[0]!.life).toBe(life + 2);
  const pick = modal(page);
  await pick.locator(`[data-pick="${shivan}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const mid = await resolveUntil(page, (st) => st.pending?.kind === "arrangeTop" && st.pending.player === 0);
  expect(mid.objects[shivan]!.zone).toBe("exile");
  const order = mid.pending?.kind === "arrangeTop" ? mid.pending.cards : [];
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("put 2 cards on the bottom of your library in any order");
  await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${order[0]}"]`) }).getByRole("button", { name: "Move deeper" }).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await settled(page, (st) => !st.pending && st.stack.length === 0 && st.objects[saga]!.zone === "battlefield");
  expect(after.players[0]!.library.slice(-2)).toEqual([order[1], order[0]]);
  expect(after.objects[shivan]!.counters.hatching).toBe(1);
  expect(after.objects[shivan]!.hiddenExile?.seen).toEqual([0]);
  expect(pageErrors(page)).toEqual([]);
});

test("Dragon-Kami's Egg: Lightning Bolt kills it, and you cast the Shivan Dragon with a hatching counter free", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, DRAGON_KAMI], exile: ["Shivan Dragon", "Divination"] });
  const [egg, shivan, div, bolt] = [one(s, "The Dragon-Kami Reborn"), one(s, "Shivan Dragon"), one(s, "Divination"), one(s, "Lightning Bolt")];
  // The Saga came back transformed; the two cards are face down with hatching counters.
  setFace(s, s.objects[egg]!, 1);
  for (const id of [shivan, div]) {
    s.objects[id]!.counters.hatching = 1;
    s.objects[id]!.hiddenExile = { by: egg, seen: [0], label: "Face down", at: 0 };
  }
  invalidateCharacteristics(s);
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  await page.locator(`[data-obj="${egg}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("cast a spell from among the exiled cards without paying its mana cost?");
  // Divination isn't a creature card.
  await expect(bar.getByRole("button", { name: "Divination" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Shivan Dragon" }).click();
  await bar.getByRole("button", { name: "Cast it", exact: true }).click();
  const after = await settled(page, (st) => st.stack.length === 0 && !st.pending && st.objects[shivan]!.zone === "battlefield");
  expect(after.objects[egg]!.zone).toBe("graveyard");
  expect(after.objects[bolt]!.zone).toBe("graveyard");
  expect(after.objects[div]!.zone).toBe("exile");
  // Only the Bolt's Mountain was tapped.
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});
