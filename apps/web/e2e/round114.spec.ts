// Round 114's prompts: "add X mana in any combination of colors" from a triggered ability (Klauth, Unrivaled Ancient):
// as it resolves, a bar to pick how much of each color (CR 106.1b, 608.2d), with no Cancel (the ability is resolving);
// Sepulchral Primordial's "for each opponent, you may put up to one target creature card ...", asked card by card.
// Cemetery Prowler's "exile a card from a graveyard": any player's, each card marked with its owner.
import { expect, test } from "@playwright/test";
import { applyAction, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Klauth attacks with Grizzly Bears: add 6 mana in any combination of colors, kept for spells this turn", async ({ page }) => {
  let s: GameState = scene({ board: ["Klauth, Unrivaled Ancient", "Grizzly Bears"] });
  const [klauth, bears] = [one(s, "Klauth, Unrivaled Ancient"), one(s, "Grizzly Bears")];
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: klauth, defender: 1 }, { attacker: bears, defender: 1 }] });
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "manaMix" && st.pending.player === 0);
  const bar = page.locator(".mana-mix");
  await expect(bar).toContainText("Klauth, Unrivaled Ancient: add 6 mana in any combination of colors (6 left)");
  await expect(bar.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  const add = bar.getByRole("button", { name: "Add" });
  for (let i = 0; i < 4; i++) await bar.getByRole("button", { name: "Red plus one" }).click();
  await expect(add).toBeDisabled();
  await bar.getByRole("button", { name: "Green plus one" }).click();
  await bar.getByRole("button", { name: "Green plus one" }).click();
  await expect(bar).toContainText("(0 left)");
  await add.click();
  await expect.poll(async () => (await state(page)).players[0]!.manaPool.R).toBe(4);
  const after = await state(page);
  expect(after.players[0]!.manaPool.G).toBe(2);
  expect(after.players[0]!.manaLots?.every((l) => l.keep === "turn" && !!l.only)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Sepulchral Primordial asks about each card: yes to Ana's Hill Giant, no to Cy's Grizzly Bears", async ({ page }) => {
  const s = scene({ hand: ["Sepulchral Primordial"], board: LANDS }, [{ yard: ["Hill Giant"] }, {}, { yard: ["Grizzly Bears"] }]);
  const [giant, bears] = [one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Sepulchral Primordial", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  await modal(page).locator(`[data-pick="${bears}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && st.pending.card === giant);
  const bar = controls(page);
  await expect(bar).toContainText("Put Hill Giant onto the battlefield under your control?");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && st.pending.card === bears);
  await expect(bar).toContainText("Put Grizzly Bears onto the battlefield under your control?");
  await bar.getByRole("button", { name: "No" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.controller).toBe(0);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Cemetery Prowler: exile a card from a graveyard, picking Ana's Hill Giant over your own", async ({ page }) => {
  const s = scene({ hand: ["Cemetery Prowler"], board: LANDS, yard: ["Hill Giant"] }, [{ yard: ["Hill Giant", "Lightning Bolt"] }]);
  const [mine, theirs] = idsOf(s, "Hill Giant", "graveyard");
  const ana = s.objects[theirs!]!.owner === 1 ? theirs! : mine!;
  const own = ana === theirs ? mine! : theirs!;
  await open(page, s);
  await card(page, "Cemetery Prowler", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const m = modal(page);
  await expect(m).toContainText("Cemetery Prowler: exile a card from a graveyard");
  await expect(m.locator(`[data-pick="${own}"] [data-owner="0"]`)).toContainText("yours");
  await expect(m.locator(`[data-pick="${ana}"] [data-owner="1"]`)).toContainText("Ana's");
  await m.locator(`[data-pick="${ana}"]`).click();
  await m.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ana]!.zone === "exile");
  expect(after.objects[own]!.zone).toBe("graveyard");
  expect(after.objects[one(after, "Cemetery Prowler")]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
