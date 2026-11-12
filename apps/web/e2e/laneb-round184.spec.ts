// Lane B round B184 in the browser: Regna's Sanction with yourself a foe (click the untapped creature to keep, the rest
// are tapped); Kathril, Aspect Warper's keyword counters, each put on the creature clicked; Curse of Inertia, whose
// target the attacking player chooses for another player's ability, then taps it.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, controls, resolveUntil } from "./ui";

test("Regna's Sanction: you a foe, keep Hill Giant untapped and the rest are tapped; a friend's creature gets a counter", async ({ page }) => {
  let s: GameState = scene({ hand: ["Regna's Sanction"], board: [...LANDS, "Hill Giant", "Grizzly Bears"] }, [{ board: ["Serra Angel"] }]);
  const [spell, giant, bears, angel] = [one(s, "Regna's Sanction"), one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Serra Angel")];
  for (const a of planCast(s, 0, spell)!) s = applyAction(s, a);
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "word");
  const bar = controls(page);
  for (const [who, pick] of [["yourself", "Foe"], ["Ana", "Friend"], ["Ben", "Friend"], ["Cy", "Friend"]] as const) {
    await expect(bar).toContainText(`choose friend or foe for ${who}`);
    await bar.getByRole("button", { name: pick }).click();
  }
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "keep");
  expect(asked.pending).toMatchObject({ player: 0, tap: true });
  await expect(bar).toContainText("click an untapped creature of yours to keep. The rest are tapped.");
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Keep 1" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[spell]!.zone === "graveyard");
  expect(after.objects[giant]!.tapped).toBe(false);
  expect(after.objects[bears]!.tapped).toBe(true);
  expect(after.objects[angel]!.counters["+1/+1"]).toBe(1);
  expect(after.objects[giant]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Kathril, Aspect Warper: Serra Angel in your graveyard, a flying counter on Grizzly Bears and a vigilance counter on Kathril", async ({ page }) => {
  const s = scene({ hand: ["Kathril, Aspect Warper"], board: [...LANDS, "Grizzly Bears"], yard: ["Serra Angel"] });
  const [kathril, bears] = [one(s, "Kathril, Aspect Warper"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Kathril, Aspect Warper", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "counters" && st.pending.counter === "flying");
  const bar = controls(page);
  await expect(bar).toContainText("put a flying counter on a creature you control");
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Put counters" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.counter === "vigilance");
  await expect(bar).toContainText("put a vigilance counter on a creature you control");
  await page.locator(`[data-obj="${kathril}"]`).click();
  await bar.getByRole("button", { name: "Put counters" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[kathril]!.zone === "battlefield");
  expect(after.objects[bears]!.counters.flying).toBe(1);
  expect(after.objects[kathril]!.counters.vigilance).toBe(1);
  expect(after.objects[kathril]!.counters["+1/+1"]).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Curse of Inertia: Ana's Curse on Ben, you attack Ben, choose Ben's Serra Angel as its target and tap it", async ({ page }) => {
  const s = scene({ board: ["Grizzly Bears"] }, [{ board: ["Curse of Inertia"] }, { board: ["Serra Angel"] }]);
  const [curse, bears, angel] = [one(s, "Curse of Inertia"), one(s, "Grizzly Bears"), one(s, "Serra Angel")];
  s.objects[curse]!.attachedToPlayer = 2;
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await attack(page, [[bears, 2]]);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  expect(asked.pending).toMatchObject({ controller: 1 });
  const targeting = page.locator(".targeting");
  await expect(targeting).toContainText("You choose the target for Ana's ability: Curse of Inertia");
  await page.locator(`[data-obj="${angel}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "tapOrUntap");
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Untap Serra Angel" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Neither" })).toBeVisible();
  await bar.getByRole("button", { name: "Tap Serra Angel", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending?.kind?.startsWith("choose"));
  expect(after.objects[angel]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
