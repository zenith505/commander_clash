// Lane B round B153 in the browser: Capricious Efreet's upkeep targets (one of yours, up to two of the others), Split
// the Spoils' piles of the exiled cards that you separate, Aura Graft's "attach it to another permanent it can enchant",
// Boros Battleshaper's two "up to one target creature" at the beginning of combat, and Ardent Dustspeaker's "you may put
// an instant or sorcery card from your graveyard on the bottom of your library".
import { expect, test } from "@playwright/test";
import { applyAction, controllerOf, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Capricious Efreet: at your upkeep you click Sol Ring, Ana's Grizzly Bears and Ben's Mind Stone; one is destroyed", async ({ page }) => {
  const s0 = scene({ board: ["Capricious Efreet", "Sol Ring"] }, [{ board: ["Grizzly Bears"] }, { board: ["Mind Stone"] }]);
  const [ring, bears, stone] = [one(s0, "Sol Ring"), one(s0, "Grizzly Bears"), one(s0, "Mind Stone")];
  const s = playUntil(s0, (st) => st.turn > s0.turn && st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await open(page, s);
  await expect(page.locator(".control-pane")).toContainText("choose target nonland permanent you control");
  await page.locator(`[data-obj="${ring}"]`).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${stone}"]`).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && [ring, bears, stone].some((id) => st.objects[id]!.zone === "graveyard"));
  expect([ring, bears, stone].filter((id) => after.objects[id]!.zone === "graveyard").length).toBe(1);
  expect(after.log.some((l) => /^Capricious Efreet chooses .+ at random\.$/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Split the Spoils: you put Hill Giant in the first pile of the exiled cards; Ana chooses the pile for your hand", async ({ page }) => {
  let s: GameState = scene({ hand: ["Split the Spoils"], board: LANDS, yard: ["Hill Giant", "Grizzly Bears", "Sol Ring"] });
  const [giant, bears, ring] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Sol Ring")];
  const t = (id: string) => ({ kind: "object" as const, id });
  for (const a of planCast(s, 0, one(s, "Split the Spoils"), [t(giant), t(bears), t(ring), { kind: "none" }, { kind: "none" }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.player === 0 || (!x.stack.length && !x.pending && waitingOn(x) === 0));
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "opponent" });
  await open(page, s);
  await expect(controls(page)).toContainText("choose an opponent to choose a pile");
  await controls(page).getByRole("button", { name: "Ana", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && !!st.pending.piles && st.pending.player === 0);
  const sep = modal(page);
  await expect(sep).toContainText("Split the Spoils: separate your exiled cards into two piles");
  await expect(sep).toContainText("An opponent chooses one for your hand, the other goes to the graveyard");
  await sep.locator(`[data-pick="${giant}"]`).click();
  await expect(sep).toContainText("First pile");
  await sep.getByRole("button", { name: "Done", exact: true }).click();
  // Ana's bot chooses which pile goes to your hand.
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && [giant, bears, ring].every((id) => x.objects[id]!.zone !== "exile"));
  const zones = [giant, bears, ring].map((id) => after.objects[id]!.zone);
  expect(zones[1]).toBe(zones[2]);
  expect(new Set(zones)).toEqual(new Set(["hand", "graveyard"]));
  expect(pageErrors(page)).toEqual([]);
});

test("Aura Graft: you take Ana's Holy Strength off her Hill Giant and choose your Grizzly Bears for it", async ({ page }) => {
  const s = scene({ hand: ["Aura Graft"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Hill Giant", "Craw Wurm", "Holy Strength"] }]);
  const [aura, giant, bears, wurm] = [one(s, "Holy Strength"), one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Craw Wurm")];
  s.objects[aura]!.attachedTo = giant;
  await open(page, s);
  await card(page, "Aura Graft", s).click();
  await page.locator(`[data-obj="${aura}"]`).first().click({ position: { x: 6, y: 6 } });
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "enchant" && st.pending.player === 0);
  const opts = (asked.pending as { options: string[] }).options;
  expect(opts).toContain(bears);
  expect(opts).toContain(wurm);
  expect(opts).not.toContain(giant);
  await expect(controls(page)).toContainText("Aura Graft: choose the permanent to attach Holy Strength to");
  await controls(page).getByRole("button", { name: /Grizzly Bears/ }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[aura]!.attachedTo === bears);
  expect(controllerOf(after, after.objects[aura]!)).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Boros Battleshaper: at your beginning of combat you click Grizzly Bears (must attack) and Hill Giant (can't)", async ({ page }) => {
  const s0 = scene({ board: ["Boros Battleshaper", "Grizzly Bears", "Hill Giant"] });
  const [bears, giant] = [one(s0, "Grizzly Bears"), one(s0, "Hill Giant")];
  const s = playUntil(s0, (st) => st.step === "beginCombat" && st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await open(page, s);
  await expect(page.locator(".control-pane")).toContainText("choose target creature");
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  const mods = after.effects.filter((e) => e.sourceName === "Boros Battleshaper");
  expect(mods.find((e) => e.affected.includes(bears))?.mods.map((m) => m.kind)).toEqual(["attacksIfAble", "mustBlock"]);
  expect(mods.find((e) => e.affected.includes(giant))?.mods.map((m) => m.kind)).toEqual(["cantAttack", "cantBlock"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Ardent Dustspeaker: Yes, pick Lightning Bolt for the bottom of your library; the top two cards are exiled to play", async ({ page }) => {
  const s0 = scene({ board: ["Ardent Dustspeaker"], yard: ["Grizzly Bears", "Lightning Bolt"], library: ["Hill Giant", "Craw Wurm"] });
  const [dust, bolt, giant, wurm] = [one(s0, "Ardent Dustspeaker"), one(s0, "Lightning Bolt"), one(s0, "Hill Giant"), one(s0, "Craw Wurm")];
  let s = playUntil(s0, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: dust, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  await expect(controls(page)).toContainText("Ardent Dustspeaker");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("instant or sorcery card");
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.objects[bolt]!.zone === "library" && st.objects[giant]!.zone === "exile");
  expect(after.players[0]!.library.at(-1)).toBe(bolt);
  expect(after.objects[wurm]!.zone).toBe("exile");
  expect(after.objects[giant]!.mayPlay).toMatchObject({ player: 0 });
  expect(pageErrors(page)).toEqual([]);
});
