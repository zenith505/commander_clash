// Lane B round B215 in the browser: Cleansing's question (click the lands, anyone's, you pay 1 life each for; every land
// no one pays for is destroyed), and Necrotic Plague's target, which you choose when the creature of yours it enchanted
// dies (a creature one of your opponents controls; the Plague stays Ana's).
import { expect, test } from "@playwright/test";
import { applyAction, invalidateCharacteristics, planCast } from "@cc/engine";
import { idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Cleansing: you pay 2 life for your Island and Ana's Mountain; Ana pays for her Swamp; your Plains and Forest are destroyed", async ({ page }) => {
  const s = scene({ hand: ["Cleansing"], board: ["Plains", "Plains", "Plains", "Island", "Forest"] }, [{ board: ["Mountain", "Swamp"] }]);
  const [island, forest] = [idsOf(s, "Island", "battlefield", 0)[0]!, idsOf(s, "Forest", "battlefield", 0)[0]!];
  const [mountain, swamp] = [idsOf(s, "Mountain", "battlefield", 1)[0]!, idsOf(s, "Swamp", "battlefield", 1)[0]!];
  const plains = idsOf(s, "Plains", "battlefield", 0);
  const life = s.players[0]!.life;
  await open(page, s);
  await card(page, "Cleansing", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "keep" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("click the lands (anyone's) you pay 1 life for, up to 7. Each land no player pays for is destroyed.");
  await expect(bar.getByRole("button", { name: "Pay no life" })).toBeVisible();
  await page.locator(`[data-obj="${island}"]`).click();
  await page.locator(`[data-obj="${mountain}"]`).click();
  await bar.getByRole("button", { name: "Pay 2 life" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[forest]!.zone === "graveyard");
  expect([island, mountain, swamp].map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "battlefield", "battlefield"]);
  expect([forest, ...plains].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard", "graveyard"]);
  expect(after.players[0]!.life).toBe(life - 2);
  expect(after.players[1]!.life).toBe(39);
  expect(pageErrors(page)).toEqual([]);
});

test("Necrotic Plague: Ana's Plague on your Grizzly Bears; when they die you choose Ben's Serra Angel, not your Craw Wurm, and the Plague returns on it", async ({ page }) => {
  const s0 = scene({ board: ["Grizzly Bears", "Craw Wurm"] }, [
    { hand: ["Lightning Bolt"], board: ["Mountain", "Hill Giant", "Necrotic Plague"] },
    { board: ["Serra Angel"] },
  ]);
  const [bears, wurm, angel, plague, bolt] = [one(s0, "Grizzly Bears"), one(s0, "Craw Wurm"), one(s0, "Serra Angel"), one(s0, "Necrotic Plague"), one(s0, "Lightning Bolt")];
  // Ana's Plague enchants your Grizzly Bears.
  s0.objects[plague]!.attachedTo = bears;
  invalidateCharacteristics(s0);
  let s = s0;
  s.priority = 1;
  for (const a of planCast(s, 1, bolt, [{ kind: "object", id: bears }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  expect(s.pending).toMatchObject({ kind: "chooseTargets", player: 0, controller: 1 });
  await open(page, s);
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("You choose the target for Ana's ability: Necrotic Plague");
  await expect(bar).toContainText("choose creature one of your opponents controls (1/1)");
  // Craw Wurm is yours: clicking it chooses nothing.
  await card(page, "Craw Wurm", s).click();
  await expect(bar).toBeVisible();
  await card(page, "Serra Angel", s).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[plague]!.zone === "battlefield");
  expect(after.objects[plague]!.attachedTo).toBe(angel);
  expect(after.objects[plague]!.controller).toBe(1);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[wurm]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
