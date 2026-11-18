// Lane B round B253 in the browser: Dralnu, Lich Lord's "sacrifice that many permanents instead" and Nefarious Lich's "exile
// that many cards from your graveyard instead", each asked one permanent or card at a time as Ana's Lightning Bolt would deal
// its damage, and Lich's "sacrifice that many nontoken permanents" once you're dealt it.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState, type TargetChoice } from "@cc/engine";
import { idsOf, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

/** Ana casts her Lightning Bolt at `target`; the engine plays on until you have a question. */
function anaBolts(s0: GameState, target: TargetChoice): GameState {
  let s = s0;
  s.priority = 1;
  for (const a of planCast(s, 1, idsOf(s, "Lightning Bolt", "hand", 1)[0]!, [target])!) s = applyAction(s, a);
  return playUntil(s, (st) => st.pending?.player === 0);
}
const shield = (st: GameState) => st.pending?.kind === "chooseOption" && st.pending.what === "damageShield" && st.pending.player === 0;

test("Dralnu, Lich Lord: Ana's Lightning Bolt would deal 3 damage to it, and you sacrifice Grizzly Bears, an Island and Savannah Lions instead", async ({ page }) => {
  const s0 = scene({ board: ["Dralnu, Lich Lord", "Grizzly Bears", "Savannah Lions", "Hill Giant", "Island"] }, [{ hand: ["Lightning Bolt"], board: ["Mountain"] }]);
  const [dralnu, bears, lions, giant, island] = ["Dralnu, Lich Lord", "Grizzly Bears", "Savannah Lions", "Hill Giant", "Island"].map((n) => idsOf(s0, n, "battlefield", 0)[0]);
  const s = anaBolts(s0, { kind: "object", id: dralnu! });
  expect(shield(s)).toBe(true);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Dralnu, Lich Lord: sacrifice 3 permanents instead of the damage (1 of 3). Which one?");
  await bar.getByRole("button", { name: "Grizzly Bears", exact: true }).click();
  await resolveUntil(page, (st) => shield(st) && /\(2 of 3\)/.test((st.pending as { prompt?: string }).prompt ?? ""));
  // Grizzly Bears is no longer among the choices.
  await expect(bar.getByRole("button", { name: "Grizzly Bears", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Island", exact: true }).click();
  await resolveUntil(page, (st) => shield(st) && /\(3 of 3\)/.test((st.pending as { prompt?: string }).prompt ?? ""));
  await bar.getByRole("button", { name: "Savannah Lions", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears!]!.zone === "graveyard");
  expect([bears, island, lions].map((id) => after.objects[id!]!.zone)).toEqual(["graveyard", "graveyard", "graveyard"]);
  expect(after.objects[dralnu!]!.zone).toBe("battlefield");
  expect(after.objects[dralnu!]!.damage ?? 0).toBe(0);
  expect(after.objects[giant!]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Nefarious Lich: Ana's Lightning Bolt would deal you 3 damage, and you exile Hill Giant, Revitalize and Grizzly Bears from your graveyard instead", async ({ page }) => {
  const s0 = scene({ board: ["Nefarious Lich"], yard: ["Grizzly Bears", "Lightning Bolt", "Revitalize", "Hill Giant"] }, [{ hand: ["Lightning Bolt"], board: ["Mountain"] }]);
  const yard = s0.players[0]!.graveyard.slice();
  const s = anaBolts(s0, { kind: "player", id: 0 });
  expect(shield(s)).toBe(true);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Nefarious Lich: exile 3 cards from your graveyard instead of the damage (1 of 3). Which one?");
  await bar.getByRole("button", { name: "Hill Giant", exact: true }).click();
  await resolveUntil(page, (st) => shield(st) && /\(2 of 3\)/.test((st.pending as { prompt?: string }).prompt ?? ""));
  await bar.getByRole("button", { name: "Revitalize", exact: true }).click();
  await resolveUntil(page, (st) => shield(st) && /\(3 of 3\)/.test((st.pending as { prompt?: string }).prompt ?? ""));
  await bar.getByRole("button", { name: "Grizzly Bears", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.exile.length === 3);
  expect(after.players[0]!.life).toBe(40);
  expect(yard.map((id) => after.objects[id]!.zone)).toEqual(["exile", "graveyard", "exile", "exile"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Lich: dealt 3 damage by Ana's Lightning Bolt, you sacrifice three nontoken permanents and keep Lich", async ({ page }) => {
  const s0 = scene({ board: ["Lich", "Grizzly Bears", "Savannah Lions", "Hill Giant"] }, [{ hand: ["Lightning Bolt"], board: ["Mountain"] }]);
  const [lich, bears, lions, giant] = ["Lich", "Grizzly Bears", "Savannah Lions", "Hill Giant"].map((n) => idsOf(s0, n, "battlefield", 0)[0]);
  const s = anaBolts(s0, { kind: "player", id: 0 });
  expect(s.pending).toMatchObject({ kind: "pickPermanents", player: 0, count: 3 });
  await open(page, s);
  const bar = controls(page);
  for (const id of [bears, lions, giant]) await page.locator(`[data-obj="${id}"]`).first().click();
  await bar.getByRole("button", { name: "Sacrifice", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant!]!.zone === "graveyard");
  expect([bears, lions, giant].map((id) => after.objects[id!]!.zone)).toEqual(["graveyard", "graveyard", "graveyard"]);
  expect(after.objects[lich!]!.zone).toBe("battlefield");
  expect(after.players[0]!.lost).toBeFalsy();
  expect(pageErrors(page)).toEqual([]);
});
