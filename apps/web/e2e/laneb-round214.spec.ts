// Lane B round B214 in the browser: Ice Cave's question to pay the mana cost of Ana's Lightning Bolt to counter it, and
// Tidal Flats' question to pay {1} for your attacking Hill Giant (you don't, so Ana's blocker gains first strike).
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, planCast, waitingOn } from "@cc/engine";
import { idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Ice Cave: Ana casts Lightning Bolt at you, and you pay its mana cost {R} to counter it", async ({ page }) => {
  const s0 = scene({ board: ["Mountain"] }, [{ hand: ["Lightning Bolt"], board: ["Mountain", "Ice Cave"] }]);
  const [bolt, mountain] = [one(s0, "Lightning Bolt"), idsOf(s0, "Mountain", "battlefield", 0)[0]!];
  let s = s0;
  s.priority = 1;
  for (const a of planCast(s, 1, bolt, [{ kind: "player", id: 0 }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Ice Cave: pay");
  await expect(bar).toContainText("or don't counter Ana's Lightning Bolt.");
  await expect(bar.getByRole("button", { name: "Don't pay" })).toBeVisible();
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect(after.players[0]!.life).toBe(40);
  expect(after.objects[mountain]!.tapped).toBe(true);
  expect(after.log.some((l) => l.text === "Ice Cave: You paid, so Lightning Bolt is countered.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Tidal Flats: Ana blocks your Hill Giant and activates it; you don't pay {1}, so her blocker gains first strike and wins", async ({ page }) => {
  const s0 = scene({ board: ["Hill Giant", "Mountain"] }, [{ board: ["Tidal Flats", "Island", "Island", "Hill Giant"] }]);
  const [flats] = [one(s0, "Tidal Flats")];
  const giants = s0.battlefield.filter((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Hill Giant");
  const mine = giants.find((id) => s0.objects[id]!.controller === 0)!;
  const hers = giants.find((id) => s0.objects[id]!.controller === 1)!;
  let s = playUntil(s0, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: mine, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareBlockers", player: 1, blocks: [{ blocker: hers, attacker: mine }] });
  s = playUntil(s, (st) => st.step === "declareBlockers" && !st.pending && waitingOn(st) === 1);
  for (const a of planActivate(s, 1, flats, 0)!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Tidal Flats: pay");
  await expect(bar).toContainText("or Ana's creatures blocking Hill Giant gain first strike until end of turn.");
  await bar.getByRole("button", { name: "Don't pay" }).click();
  const after = await resolveUntil(page, (st) => st.step === "main2");
  expect(after.objects[mine]!.zone).toBe("graveyard");
  expect(after.objects[hers]!.zone).toBe("battlefield");
  expect(after.log.some((l) => l.text === "Tidal Flats: Hill Giant gains first strike until end of turn.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
