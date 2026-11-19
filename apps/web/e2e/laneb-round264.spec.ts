// Lane B round B264 in the browser: Close Encounter's cost picks a warped creature card you own in exile; Soul Echo's
// upkeep trigger asks you, the opponent it targets, whether damage to Ana removes echo counters instead; Bend or Break
// asks you to separate your lands into two piles and which opponent chooses the pile that's destroyed.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Close Encounter: choose your warped Bygone Colossus in exile for its cost; 9 damage to Ana's Hill Giant", async ({ page }) => {
  const s = scene({ hand: ["Close Encounter"], board: [...LANDS, "Grizzly Bears"], exile: ["Bygone Colossus"] }, [{ board: ["Hill Giant"] }]);
  const [colossus, bears, giant] = [one(s, "Bygone Colossus"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  // As warp's delayed trigger leaves it (CR 702.185b).
  s.objects[colossus]!.warpedZc = s.objects[colossus]!.zoneChanges ?? 0;
  await open(page, s);
  await card(page, "Close Encounter", s).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("Close Encounter: choose a creature you control or a warped creature card you own in exile");
  // Your creature or your warped card; not Ana's creature.
  await expect(pick.locator(`[data-pick="${bears}"]`)).toHaveCount(1);
  await expect(pick.locator(`[data-pick="${colossus}"]`)).toHaveCount(1);
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${colossus}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(after.objects[colossus]!.zone).toBe("exile");
  expect(after.log.some((l) => l.text === "You chooses Bygone Colossus (a warped card in exile).")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Soul Echo: Ana's upkeep trigger targets you; click Yes, and her Lava Axe's 5 damage to herself removes her 3 echo counters instead", async ({ page }) => {
  let s: GameState = scene({ board: LANDS }, [{ board: ["Soul Echo", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain"], hand: ["Lava Axe"] }]);
  const echo = one(s, "Soul Echo");
  s.objects[echo]!.counters.echo = 3;
  s = playUntil(s, (st) => st.activePlayer === 1 && st.pending?.kind === "chooseTargets" && st.pending.player === 1);
  s = applyAction(s, { type: "chooseTargets", player: 1, targets: [{ kind: "player", id: 0 }] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Choose that for each 1 damage that would be dealt to Soul Echo's controller until their next upkeep, they remove an echo counter from Soul Echo instead?");
  await bar.getByRole("button", { name: "Yes" }).click();
  let mid: GameState = s;
  await expect.poll(async () => (mid = await state(page)).damageMods?.length ?? 0).toBe(1);
  expect(mid.damageMods![0]!.you).toBe(1);
  // Ana's Lava Axe at herself (in the engine): no life lost, the counters gone instead.
  let t: GameState = mid;
  t = playUntil(t, (st) => st.step === "main1" && st.activePlayer === 1 && !st.pending && st.stack.length === 0 && st.priority === 1);
  const life = t.players[1]!.life;
  const axe = one(t, "Lava Axe");
  for (const a of planCast(t, 1, axe, [{ kind: "player", id: 1 }])!) t = applyAction(t, a);
  t = playUntil(t, (st) => st.objects[axe]!.zone === "graveyard" && st.stack.length === 0);
  expect(t.players[1]!.life).toBe(life);
  expect(t.objects[echo]!.counters.echo ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Bend or Break: separate your lands into two piles, choose Ana to choose one; it's destroyed and the other pile tapped", async ({ page }) => {
  const s = scene({ hand: ["Bend or Break"], board: ["Mountain", "Mountain", "Mountain", "Mountain", "Forest"] }, [{ board: ["Forest", "Forest"] }]);
  const [bend, forest] = [one(s, "Bend or Break"), idsOf(s, "Forest", "battlefield", 0)[0]!];
  const mine = [...idsOf(s, "Mountain", "battlefield", 0), forest];
  await open(page, s);
  await card(page, "Bend or Break", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("separate all nontoken lands you control into two piles");
  // The first pile: the Forest (a land that paid for the spell is tapped, and still in a pile).
  await page.locator(`[data-obj="${forest}"]`).first().click();
  await bar.getByRole("button", { name: "First pile: 1, second pile: 4", exact: true }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent" && st.pending.player === 0);
  expect(asked.pending?.kind === "chooseOption" ? asked.pending.labels : undefined).toContain("Ana");
  await expect(bar).toContainText("which opponent chooses one of your piles of lands?");
  await bar.getByRole("button", { name: "Ana", exact: true }).click();
  // Ana (a bot) chooses one of your piles; she may choose you to choose one of hers.
  let after = await resolveUntil(page, (st) => st.objects[bend]!.zone === "graveyard" || (st.pending?.kind === "chooseOption" && st.pending.what === "pile" && st.pending.player === 0));
  if (after.objects[bend]!.zone !== "graveyard") {
    await expect(modal(page)).toContainText("choose one of Ana's piles of lands");
    await modal(page).getByRole("button", { name: "Destroy pile 1" }).click();
    after = await resolveUntil(page, (st) => st.objects[bend]!.zone === "graveyard");
  }
  // A bot destroys the bigger pile, the four Mountains; the Forest is tapped.
  const done = after;
  for (const id of mine.slice(0, 4)) expect(done.objects[id]!.zone).toBe("graveyard");
  expect(done.objects[forest]!.zone).toBe("battlefield");
  expect(done.objects[forest]!.tapped).toBe(true);
  expect(done.log.some((l) => l.text === "You separates their lands into two piles: Forest; and Mountain, Mountain, Mountain, Mountain.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
