// Lane B round B162 in the browser: Sorcerous Spyglass asks for an opponent, shows their hand, then a card name;
// Nivmagus Elemental's cost picks a spell of yours on the stack to exile; Bargaining Table asks which opponent's hand
// sets X; Selective Snare asks for a creature type as it's cast, before its targets.
import { expect, test } from "@playwright/test";
import { abilityProblem, applyAction, planCast } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Sorcerous Spyglass: choose Ana, see her hand, name Mind Stone; its draw ability can't be activated", async ({ page }) => {
  const s = scene({ hand: ["Sorcerous Spyglass"], board: LANDS }, [{ hand: ["Night's Whisper"], board: ["Mind Stone"] }]);
  const [spyglass, stone] = [one(s, "Sorcerous Spyglass"), one(s, "Mind Stone")];
  await open(page, s);
  await card(page, "Sorcerous Spyglass", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "player" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "You (you)", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Ana", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "cardName");
  await expect(page.locator(".log")).toContainText("Night's Whisper");
  const pick = modal(page);
  await expect(pick).toContainText("Sorcerous Spyglass: choose a card name");
  await pick.locator('[data-name="Mind Stone"]').click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.objects[spyglass]!.chosen?.name).toBe("Mind Stone");
  expect(abilityProblem(after, 1, stone, 0)).toMatch(/can't be activated/);
  expect(pageErrors(page)).toEqual([]);
});

test("Nivmagus Elemental: exile your Lightning Bolt from the stack for two +1/+1 counters", async ({ page }) => {
  let s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Nivmagus Elemental"] });
  const [bolt, niv] = [one(s, "Lightning Bolt"), one(s, "Nivmagus Elemental")];
  for (const a of planCast(s, 0, bolt, [{ kind: "player", id: 1 }])!) s = applyAction(s, a);
  expect(s.priority).toBe(0);
  await open(page, s);
  await page.locator(`[data-obj="${niv}"]`).first().click();
  if (await menu(page).count()) await menu(page).locator("button", { hasText: "Exile an instant or sorcery spell" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Nivmagus Elemental: exile an instant or sorcery spell you control");
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[bolt]!.zone).toBe("exile");
  expect(after.objects[niv]!.counters["+1/+1"]).toBe(2);
  expect(after.players[1]!.life).toBe(40);
  expect(pageErrors(page)).toEqual([]);
});

test("Bargaining Table: choose Ben, whose hand of two cards makes X 2, and draw", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Bargaining Table"] }, [{ hand: ["Shock", "Shock", "Shock"] }, { hand: ["Shock", "Shock"] }]);
  const table = one(s, "Bargaining Table");
  await open(page, s);
  const before = await state(page);
  const hand = before.players[0]!.hand.length;
  await page.locator(`[data-obj="${table}"]`).first().click();
  if (await menu(page).count()) await menu(page).locator("button", { hasText: "Draw a card" }).click();
  const pick = page.locator(".x-opponent-pick");
  await expect(pick).toContainText("Bargaining Table");
  await expect(pick.getByRole("button", { name: "You", exact: true })).toHaveCount(0);
  await pick.getByRole("button", { name: "Ben", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[table]!.tapped);
  expect(after.players[0]!.hand.length).toBe(hand + 1);
  // X = 2 from Ben's hand: two lands tapped, plus the Table.
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.tapped).length).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Selective Snare: X = 2, choose Goblin before the targets, then return two Goblins", async ({ page }) => {
  const s = scene({ hand: ["Selective Snare"], board: LANDS }, [{ board: ["Raging Goblin", "Goblin King", "Grizzly Bears"] }]);
  const [raging, king, bears] = [one(s, "Raging Goblin"), one(s, "Goblin King"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Selective Snare", s).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const types = modal(page);
  await expect(types).toContainText("Selective Snare: choose a creature type");
  await expect(types.locator('button[data-type="Goblin"]').first()).toContainText("2 theirs");
  await types.locator('button[data-type="Goblin"]').first().click();
  // A Bear isn't a Goblin: not a legal target.
  await expect(page.locator(`[data-obj="${bears}"].targetable`)).toHaveCount(0);
  await page.locator(`[data-obj="${raging}"]`).first().click();
  await page.locator(`[data-obj="${king}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Selective Snare")]!.zone === "graveyard");
  expect([raging, king, bears].map((id) => after.objects[id]!.zone)).toEqual(["hand", "hand", "battlefield"]);
  expect(after.log.some((l) => l.text.includes("casts Selective Snare with X=2, choosing Goblin"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Selective Snare: Cancel in the creature type picker calls the cast off", async ({ page }) => {
  const s = scene({ hand: ["Selective Snare"], board: LANDS }, [{ board: ["Raging Goblin"] }]);
  await open(page, s);
  await card(page, "Selective Snare", s).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("1");
  await x.getByRole("button", { name: "X = 1" }).click();
  const types = modal(page);
  await expect(types).toContainText("choose a creature type");
  await types.getByRole("button", { name: "Cancel" }).click();
  await expect(types).toHaveCount(0);
  const after = await state(page);
  expect(after.objects[one(s, "Selective Snare")]!.zone).toBe("hand");
  expect(after.stack.length).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
