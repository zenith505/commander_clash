// Lane B round 22 in the browser: Qal Sisma Behemoth's own block cost on the Block button (CR 509.1d), Personal
// Incarnation's "only its owner may activate" on a creature another player controls (CR 602.2), and Pillar Tombs of Aku's
// "lose 5 life and its controller sacrifices it" choice.
import { expect, test } from "@playwright/test";
import { applyAction, controllerOf, invalidateCharacteristics, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, menu, resolveUntil } from "./ui";

test("Qal Sisma Behemoth blocks only if you pay {2}: the Block button says so and taps two lands", async ({ page }) => {
  let s: GameState = scene({ board: ["Qal Sisma Behemoth", "Mountain", "Forest"] }, [{ board: ["Hill Giant"] }]);
  const [beh, giant] = [one(s, "Qal Sisma Behemoth"), one(s, "Hill Giant")];
  const lands = [idsOf(s, "Mountain", "battlefield", 0)[0]!, idsOf(s, "Forest", "battlefield", 0)[0]!];
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: giant, defender: 0 }] });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await page.locator(`[data-obj="${beh}"]`).first().click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await bar.getByRole("button", { name: "Block with 1 (pay {2})" }).click();
  const after = await resolveUntil(page, (st) => st.pending?.kind !== "declareBlockers" && st.objects[beh]!.blocking !== undefined);
  expect(after.objects[beh]!.blocking).toEqual([giant]);
  expect(lands.map((id) => after.objects[id]!.tapped)).toEqual([true, true]);
  expect(pageErrors(page)).toEqual([]);
});

test("Personal Incarnation under Ana's control: its owner still activates its ability from Ana's side", async ({ page }) => {
  const s = scene({ board: LANDS, exile: ["Personal Incarnation"] }, [{ board: ["Grizzly Bears"] }]);
  // Your Personal Incarnation, which Ana controls (as with a steal effect).
  const pi = one(s, "Personal Incarnation");
  s.players[0]!.exile = s.players[0]!.exile.filter((id) => id !== pi);
  s.objects[pi]!.zone = "battlefield";
  s.battlefield.push(pi);
  s.effects.push({ id: `x${s.nextId++}`, timestamp: s.nextTimestamp++, controller: 1, sourceName: "test", duration: "game", affected: [pi], mods: [{ kind: "control" }] });
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${pi}"]`).first().click();
  const ability = menu(page).locator("button", { hasText: "next 1 damage" });
  await expect(ability).toHaveAttribute("title", "Only its owner may activate this ability; you control it.");
  await ability.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[pi]!.redirectNext?.length ?? 0) > 0);
  expect(controllerOf(after, after.objects[pi]!)).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Pillar Tombs of Aku: in your upkeep, decline to sacrifice a creature, lose 5 life, and Ana sacrifices it", async ({ page }) => {
  let s: GameState = scene({ board: ["Grizzly Bears"] }, [{ exile: ["Pillar Tombs of Aku"] }]);
  const [bears, tombs] = [one(s, "Grizzly Bears"), one(s, "Pillar Tombs of Aku")];
  // Ana's Pillar Tombs comes in during Cy's turn, so only your upkeep sees it.
  s = playUntil(s, (st) => st.activePlayer === 3 && st.step === "end");
  s.players[1]!.exile = s.players[1]!.exile.filter((id) => id !== tombs);
  s.objects[tombs]!.zone = "battlefield";
  s.objects[tombs]!.timestamp = s.nextTimestamp++;
  s.battlefield.push(tombs);
  invalidateCharacteristics(s);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Sacrifice a creature" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Lose 5 life (Ana sacrifices Pillar Tombs of Aku)" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[tombs]!.zone === "graveyard");
  expect(after.players[0]!.life).toBe(35);
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
