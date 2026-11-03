// Round 259's prompts: Temporal Extortion ("pay half your life, rounded up?" for each player, in turn order), Ultimate
// Magic: Meteor cast from exile (you choose an artifact or land of each opponent's to destroy) and Colfenor's Urn ("exile
// it?" as a big creature of yours dies).
import { expect, test } from "@playwright/test";
import { applyAction, invalidateCharacteristics, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Temporal Extortion: you decline to pay half your life, the bots decline too, and you take an extra turn", async ({ page }) => {
  const s = scene({ hand: ["Temporal Extortion"], board: [...LANDS, "Swamp"] });
  const spell = one(s, "Temporal Extortion");
  await open(page, s);
  await card(page, "Temporal Extortion", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "punisher" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Pay half your life, rounded up? If anyone does, counter Temporal Extortion.");
  await bar.getByRole("button", { name: "Don't" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[spell]!.zone === "graveyard");
  expect(after.extraTurns ?? []).toHaveLength(1);
  expect(after.players.map((p) => p.life)).toEqual([40, 40, 40, 40]);
  expect(pageErrors(page)).toEqual([]);
});

test("Temporal Extortion: paying half your life (20 of 39, rounded up) counters it", async ({ page }) => {
  const s = scene({ hand: ["Temporal Extortion"], board: [...LANDS, "Swamp"], life: 39 });
  const spell = one(s, "Temporal Extortion");
  await open(page, s);
  await card(page, "Temporal Extortion", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "punisher" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Pay half your life, rounded up" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[spell]!.zone === "graveyard");
  expect(after.players[0]!.life).toBe(19);
  expect(after.extraTurns ?? []).toHaveLength(0);
  expect(after.log.some((l) => /pays 20 life \(half their life, rounded up\)/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

/** Ultimate Magic: Meteor foretold on an earlier turn, cast for its foretell cost, up to your choice for Ana. */
function meteorScene(): GameState {
  let s = scene({ hand: ["Ultimate Magic: Meteor"], board: LANDS }, [{ board: ["Sol Ring", "Wastes", "Grizzly Bears"] }, { board: ["Mind Stone"] }]);
  const meteor = one(s, "Ultimate Magic: Meteor");
  s.players[0]!.manaPool.C = 2;
  s = applyAction(s, { type: "foretell", player: 0, objectId: meteor });
  // As if it was foretold on your last turn.
  s.objects[meteor]!.mayPlay!.turn = s.turn - 4;
  invalidateCharacteristics(s);
  for (const a of planCast(s, 0, meteor, undefined, undefined, "auto", undefined, { alt: "foretell" })!) s = applyAction(s, a);
  return playUntil(s, (st) => st.pending?.kind === "pickPermanents");
}

test("Ultimate Magic: Meteor cast from exile: choose Ana's Wastes (Ben's Mind Stone is his only one); both are destroyed", async ({ page }) => {
  const s = meteorScene();
  const [ring, wastes, bears, stone] = ["Sol Ring", "Wastes", "Grizzly Bears", "Mind Stone"].map((n) => one(s, n)) as [string, string, string, string];
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Ultimate Magic: Meteor: click an artifact or land of Ana's. Ultimate Magic: Meteor destroys the chosen permanents.");
  await page.locator(`[data-obj="${wastes}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[stone]!.zone === "graveyard");
  expect([after.objects[wastes]!.zone, after.objects[ring]!.zone, after.objects[bears]!.zone]).toEqual(["graveyard", "battlefield", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Colfenor's Urn: your Craw Wurm (6/4, already dealt 2 damage) dies to your Shock; exile it with the Urn", async ({ page }) => {
  const s = scene({ hand: ["Shock"], board: [...LANDS, "Colfenor's Urn", "Craw Wurm"] });
  const wall = one(s, "Craw Wurm");
  s.objects[wall]!.damage = 2;
  await open(page, s);
  await card(page, "Shock", s).click();
  await page.locator(`[data-obj="${wall}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Colfenor's Urn");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[wall]!.zone === "exile");
  expect(after.log.some((l) => /Colfenor's Urn exiles Craw Wurm/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
