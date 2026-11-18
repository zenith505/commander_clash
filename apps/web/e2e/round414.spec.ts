// Round 414 in the browser: Elrond of the White Council's secret vote (two fellowship votes with Brago's Representative,
// then your Grizzly Bears clicked for each of them), Boltbender turned face up in answer to Ana's Murder (Murder's new
// target, Ana's Hill Giant), and Ana's Confusion in the Ranks triggering on your Grizzly Bears (you click the target, Ana's
// Hill Giant, and the two are exchanged).
import { expect, test } from "@playwright/test";
import { applyAction, controllerOf, invalidateCharacteristics, planCast } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

const SWAMPS = ["Swamp", "Swamp", "Swamp"];

test("Elrond of the White Council: vote fellowship twice (Brago's Representative), then click your Grizzly Bears for each vote", async ({ page }) => {
  const s = scene({ hand: ["Elrond of the White Council"], board: [...LANDS, "Brago's Representative", "Grizzly Bears"] });
  const [elrond, bears] = [one(s, "Elrond of the White Council"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Elrond of the White Council", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "vote" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("vote for fellowship or aid");
  await bar.getByRole("button", { name: "fellowship", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "vote" && st.pending.player === 0);
  await expect(bar).toContainText("vote an additional time");
  await bar.getByRole("button", { name: "fellowship", exact: true }).click();
  const pick = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  expect(pick.pending).toMatchObject({ options: expect.arrayContaining([elrond, bears]) });
  // The bots, with no creatures, voted fellowship too: the votes are revealed.
  expect(pick.log.some((l) => l.text.startsWith("The votes are revealed: You for fellowship, You for fellowship"))).toBe(true);
  await expect(bar).toContainText("2 such votes left");
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0 && !st.pending.prompt?.includes("votes left"));
  await expect(bar).not.toContainText("2 such votes left");
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(controllerOf(after, after.objects[bears]!)).toBe(0);
  expect(after.objects[elrond]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(after.effects.some((e) => e.affected.includes(bears) && e.mods.some((m) => m.kind === "addAbility" && m.text === "This creature can't attack its owner."))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Boltbender: Ana casts Murder at your Grizzly Bears; you turn Boltbender face up and click her Hill Giant as Murder's new target", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Boltbender", "Grizzly Bears"] }, [{ hand: ["Murder"], board: [...SWAMPS, "Hill Giant"] }]);
  const [bolt, bears, giant, murder] = [one(s0, "Boltbender"), one(s0, "Grizzly Bears"), one(s0, "Hill Giant"), one(s0, "Murder")];
  s0.objects[bolt]!.faceDown = "disguise";
  invalidateCharacteristics(s0);
  let s = playUntil(s0, (x) => x.activePlayer === 1 && x.step === "main1" && x.priority === 1 && x.stack.length === 0 && !x.pending);
  for (const a of planCast(s, 1, murder, [{ kind: "object", id: bears }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.priority === 0 && x.stack.length === 1 && !x.pending);
  await open(page, s);
  await page.locator(`[data-obj="${bolt}"]`).first().click();
  await menu(page).getByRole("button", { name: /Turn face up: disguise/ }).click();
  const retarget = await resolveUntil(page, (x) => x.pending?.kind === "newTargets" && x.pending.player === 0);
  expect(retarget.objects[bolt]!.faceDown).toBeFalsy();
  await expect(page.locator(".targeting")).toContainText("Boltbender: new targets for Murder");
  await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[giant]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Confusion in the Ranks: your Grizzly Bears enters under Ana's Confusion; you click her Hill Giant and the two are exchanged", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears"], board: LANDS }, [{ board: ["Confusion in the Ranks", "Hill Giant"] }]);
  const [bears, giant, conf] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Confusion in the Ranks")];
  await open(page, s);
  await card(page, "Grizzly Bears", s).click();
  const choose = await resolveUntil(page, (x) => x.pending?.kind === "chooseTargets" && x.pending.player === 0);
  expect(choose.pending).toMatchObject({ controller: 1 });
  await expect(page.locator(".targeting")).toContainText("You choose the target for Ana's ability");
  await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && controllerOf(x, x.objects[giant]!) === 0);
  expect(controllerOf(after, after.objects[bears]!)).toBe(1);
  expect(controllerOf(after, after.objects[conf]!)).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
