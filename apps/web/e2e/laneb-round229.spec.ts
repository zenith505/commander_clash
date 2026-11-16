// Lane B round B229 in the browser: Backdraft's choice of a player and the damage one of their sorcery spells dealt this
// turn, Ulamog's Despoiler's choice of two cards opponents own in exile as it enters, and Suffocation cast after a red
// spell dealt you damage.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Backdraft: choose Ana and the sorcery spell that dealt 7 damage; she's dealt 3", async ({ page }) => {
  const s = scene({ hand: ["Backdraft"], board: LANDS });
  // This turn Ana cast two sorcery spells: one dealt 7 damage, the other 2 (logged as the engine logs them).
  s.castThisTurn = [{ player: 1, card: "a", types: ["Sorcery"] }, { player: 1, card: "b", types: ["Sorcery"] }];
  s.turnLog = { ...s.turnLog, spellDamage: [{ key: "x1@0", controller: 1, colors: ["R"], types: ["Sorcery"], cast: true, amount: 7, player: 0 }, { key: "x2@0", controller: 1, colors: ["R"], types: ["Sorcery"], cast: true, amount: 2, player: 2 }] };
  await open(page, s);
  await card(page, "Backdraft", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "spellDamageBack" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose a player who cast a sorcery spell this turn");
  await expect(bar.getByRole("button", { name: "Ana: 1 (a sorcery spell that dealt 2)" })).toBeVisible();
  await bar.getByRole("button", { name: "Ana: 3 (a sorcery spell that dealt 7)" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === 37);
  expect(after.players[1]!.life).toBe(37);
  expect(pageErrors(page)).toEqual([]);
});

test("Ulamog's Despoiler: as it enters, pick Ana's and Ben's exiled cards; they go to their graveyards and it has four +1/+1 counters", async ({ page }) => {
  const s = scene({ hand: ["Ulamog's Despoiler"], board: LANDS }, [{ exile: ["Hill Giant"] }, { exile: ["Grizzly Bears"] }]);
  const [despoiler, giant, bears] = [one(s, "Ulamog's Despoiler"), one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Ulamog's Despoiler", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("Ulamog's Despoiler: choose two cards your opponents own to put into their owners' graveyards as it enters");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[despoiler]!.zone === "battlefield" && (st.objects[despoiler]!.counters["+1/+1"] ?? 0) === 4);
  expect([after.objects[giant]!.zone, after.objects[bears]!.zone]).toEqual(["graveyard", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Suffocation: after Ana's red sorcery spell dealt you damage, cast it; Ana is dealt 4", async ({ page }) => {
  const s = scene({ hand: ["Suffocation"], board: LANDS });
  s.turnLog = { ...s.turnLog, spellDamage: [{ key: "x1@0", controller: 1, colors: ["R"], types: ["Sorcery"], cast: true, amount: 5, player: 0 }] };
  await open(page, s);
  await card(page, "Suffocation", s).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === 36);
  expect(after.players[1]!.life).toBe(36);
  expect(after.delayed?.length ?? 0).toBeGreaterThan(0);
  expect(pageErrors(page)).toEqual([]);
});
