// Round 118's prompts: with Odric, Master Tactician, the blocks another player chose for you cost mana (Archangel of
// Tithes): Pay or Don't pay (rulings: if you don't, they choose again); Agitator Ant's "each player may put two +1/+1
// counters on a creature they control" (a button for each of your creatures, or "Choose nothing").
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Odric: Ana chooses your blocks, which cost {1} with her Archangel of Tithes attacking; you pay", async ({ page }) => {
  let s: GameState = scene({ board: ["Giant Spider", "Plains"] }, [{ board: ["Odric, Master Tactician", "Archangel of Tithes", "Hill Giant", "Grizzly Bears"] }]);
  const [spider, odric, angel, giant, bears, plains] = [one(s, "Giant Spider"), one(s, "Odric, Master Tactician"), one(s, "Archangel of Tithes"), one(s, "Hill Giant"), one(s, "Grizzly Bears"), idsOf(s, "Plains", "battlefield", 0)[0]!];
  // Ana's turn, in the engine: she attacks you with all four, and Odric's trigger lets her choose your blocks.
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [odric, angel, giant, bears].map((attacker) => ({ attacker, defender: 0 })) });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers");
  expect(s.pending).toMatchObject({ player: 1, defender: 0 });
  s = applyAction(s, { type: "declareBlockers", player: 1, blocks: [{ blocker: spider, attacker: giant }] });
  expect(s.pending).toMatchObject({ kind: "chooseMay", player: 0 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("for the blocks Ana chose (Giant Spider blocks Hill Giant)?");
  await expect(bar.getByRole("button", { name: "Don't pay" })).toBeVisible();
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[spider]!.blocking !== undefined);
  expect(after.objects[spider]!.blocking).toEqual([giant]);
  expect(after.objects[plains]!.tapped).toBe(true);
  expect(after.log.some((l) => /^You pays? \{1\} to block\.$/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Agitator Ant: at your end step you choose a creature of yours for two +1/+1 counters; it's goaded", async ({ page }) => {
  let s: GameState = scene({ board: ["Agitator Ant", "Hill Giant"] }, [{ board: ["Grizzly Bears"] }]);
  const giant = one(s, "Hill Giant");
  // The end step, in the engine: the Ant's trigger asks you first.
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "vote" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Agitator Ant: put two +1/+1 counters on a creature you control");
  await expect(bar.getByRole("button", { name: "Choose nothing" })).toBeVisible();
  // Only your creatures: not Ana's Grizzly Bears.
  await expect(bar.getByRole("button", { name: /Grizzly Bears/ })).toHaveCount(0);
  await bar.getByRole("button", { name: "Hill Giant (You)" }).click();
  const after = await resolveUntil(page, (st) => (st.objects[giant]!.counters["+1/+1"] ?? 0) > 0);
  expect(after.objects[giant]!.counters["+1/+1"]).toBe(2);
  expect(characteristics(after, after.objects[giant]!).goadedBy).toContain(0);
  expect(pageErrors(page)).toEqual([]);
});
