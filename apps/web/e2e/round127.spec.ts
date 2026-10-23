// Round 127's prompts: Misleading Signpost (choose what an attacking creature attacks now), Demon of Fate's Design
// ("Cast it: pay 3 life"), Hazel of the Rootbloom's mana used by autopay, Resonance Technician's X, Yedora's "may"
// (the creature returns face down as a Forest), Nautiloid Ship's pick among the cards it exiled and The Great
// Synthesis' casting from your hand.
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, playWithBots, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Misleading Signpost: Ana's Grizzly Bears attacks you; flash it in, then make the Bears attack Ben", async ({ page }) => {
  const s0 = scene({ hand: ["Misleading Signpost"], board: [...LANDS] }, [{ board: ["Grizzly Bears"] }]);
  const bears = idsOf(s0, "Grizzly Bears", "battlefield", 1)[0]!;
  let s = playUntil(s0, (st) => st.pending?.kind === "declareAttackers" && st.activePlayer === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: bears, defender: 0 }] });
  s = playUntil(s, (st) => !st.pending && waitingOn(st) === 0);
  // Cast and its trigger's target in the engine; the page opens on the "may".
  s = passToPrompt(run(s, planCast(s, 0, one(s, "Misleading Signpost"))));
  s = passToPrompt(applyAction(s, { type: "chooseTargets", player: 0, targets: [{ kind: "object", id: bears }] }));
  expect(s.pending).toMatchObject({ kind: "chooseMay", player: 0 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Misleading Signpost:");
  await bar.getByRole("button", { name: "Yes" }).click();
  await expect(bar).toContainText("choose what Grizzly Bears attacks now");
  // Not you (what it attacks now), never Ana (its controller).
  await expect(bar.getByRole("button", { name: "You", exact: true })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Ana", exact: true })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Cy", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  await expect.poll(async () => (await state(page)).objects[bears]!.attacking).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Demon of Fate's Design: cast Rhystic Study for 3 life, no mana", async ({ page }) => {
  const s = scene({ hand: ["Rhystic Study"], board: ["Demon of Fate's Design", "Island", "Island", "Island"] });
  const study = one(s, "Rhystic Study");
  await open(page, s);
  await card(page, "Rhystic Study", s).click();
  await menu(page).getByRole("button", { name: "Cast it: pay 3 life" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[study]!.zone === "battlefield");
  expect(after.players[0]!.life).toBe(s.players[0]!.life - 3);
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Hazel of the Rootbloom in autopay: a Forest and two Clues tapped by Hazel pay for Pernicious Deed", async ({ page }) => {
  const s = scene({ hand: ["Pernicious Deed"], board: ["Forest", "Hazel of the Rootbloom"], tokens: ["Clue", "Clue"] });
  const [deed, hazel] = [one(s, "Pernicious Deed"), one(s, "Hazel of the Rootbloom")];
  const clues = s.battlefield.filter((id) => s.objects[id]!.isToken);
  await open(page, s);
  await card(page, "Pernicious Deed", s).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[deed]!.zone === "battlefield");
  expect(after.players[0]!.life).toBe(s.players[0]!.life - 2);
  expect(clues.every((id) => after.objects[id]!.tapped)).toBe(true);
  expect(after.objects[hazel]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Resonance Technician: X = 3, tap three Clues, copy your Divination", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Resonance Technician"], tokens: ["Clue", "Clue", "Clue"] });
  const clues = s.battlefield.filter((id) => s.objects[id]!.isToken);
  const hand0 = s.players[0]!.hand.length;
  await open(page, s);
  await card(page, "Divination", s).click();
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  const spell = (await state(page)).stack[0]!.id;
  await card(page, "Resonance Technician", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /Tap X untapped artifacts/ }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("tap X untapped artifacts you control");
  await x.getByLabel("X", { exact: true }).fill("3");
  await x.getByRole("button", { name: "X = 3" }).click();
  await page.locator(`[data-stack="${spell}"]`).click();
  const costBar = page.locator(".targeting");
  await expect(costBar).toContainText("tap 3 untapped artifacts you control");
  for (const c of clues) await page.locator(`[data-obj="${c}"]`).first().click();
  await costBar.getByRole("button", { name: /activate/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === hand0 - 1 + 4);
  expect(clues.every((id) => after.objects[id]!.tapped)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Yedora, Grave Gardener: Murder your Grizzly Bears, then return it face down as a Forest", async ({ page }) => {
  const s = scene({ hand: ["Murder"], board: [...LANDS, "Yedora, Grave Gardener", "Grizzly Bears"] });
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Murder", s).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Yedora, Grave Gardener:");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.faceDown).toBeTruthy();
  expect(after.objects[bears]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Nautiloid Ship: it exiled Ben's graveyard; after it hits Ana, pick Grizzly Bears (not the Lightning Bolt)", async ({ page }) => {
  const s0 = scene({ hand: ["Nautiloid Ship"], board: [...LANDS, "Hill Giant"] }, [{}, { yard: ["Grizzly Bears", "Llanowar Elves", "Lightning Bolt"] }]);
  const [ship, giant] = [one(s0, "Nautiloid Ship"), one(s0, "Hill Giant")];
  const [bears, elves, bolt] = [one(s0, "Grizzly Bears"), one(s0, "Llanowar Elves"), one(s0, "Lightning Bolt")];
  // Cast, its target, and crewing in the engine; the page opens on the combat damage trigger's "may".
  let s = passToPrompt(run(s0, planCast(s0, 0, ship)));
  s = passToPrompt(applyAction(s, { type: "chooseTargets", player: 0, targets: [{ kind: "player", id: 2 }] }));
  expect(s.objects[bears]!.zone).toBe("exile");
  s.objects[ship]!.controlledSinceTurn = -1;
  s = passToPrompt(run(s, planActivate(s, 0, ship, 0, undefined, undefined, [giant])));
  s = playWithBots(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0, [[ship, 1]]);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Nautiloid Ship:");
  await bar.getByRole("button", { name: "Yes" }).click();
  const m = modal(page);
  await expect(m.locator(`[data-pick="${elves}"]`)).toBeVisible();
  await expect(m.locator(`[data-pick="${bolt}"]`)).toHaveCount(0);
  await m.locator(`[data-pick="${bears}"]`).click();
  await m.getByRole("button", { name: "Done" }).click();
  await expect.poll(async () => (await state(page)).objects[bears]!.zone).toBe("battlefield");
  const after = await state(page);
  expect(after.objects[bears]!.controller).toBe(0);
  expect(after.objects[elves]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("The Great Synthesis III: cast Grizzly Bears from your hand free, then Done; Jin-Gitaxias returns", async ({ page }) => {
  const s0 = scene({ hand: ["Grizzly Bears", "Divination"], board: ["Jin-Gitaxias // The Great Synthesis"] });
  const [jin, bears, divination] = [one(s0, "Jin-Gitaxias"), one(s0, "Grizzly Bears"), one(s0, "Divination")];
  s0.objects[jin]!.face = 1;
  s0.objects[jin]!.counters.lore = 2;
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("from your hand");
  await expect(bar.getByRole("button", { name: "Divination" })).toBeVisible();
  await bar.getByRole("button", { name: "Grizzly Bears" }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && !st.pending.options.includes(bears));
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[divination]!.zone).toBe("hand");
  expect(after.objects[jin]!.zone).toBe("battlefield");
  expect(after.objects[jin]!.face ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
