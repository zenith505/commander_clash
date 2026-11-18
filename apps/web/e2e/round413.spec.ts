// Round 413 in the browser: Perplexing Chimera's "you may exchange control" when Ana casts Murder at your Grizzly Bears,
// then its new target, Ana's Hill Giant; and Sudden Substitution cast in answer to Ana's Murder, its two targets (the
// spell on the stack, then your Grizzly Bears), then Murder's new target as its new controller.
import { expect, test } from "@playwright/test";
import { applyAction, controllerOf, planCast } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

const SWAMPS = ["Swamp", "Swamp", "Swamp"];

test("Perplexing Chimera: Ana casts Murder at your Grizzly Bears, you click Yes, then her Hill Giant as its new target", async ({ page }) => {
  const s0 = scene({ board: ["Perplexing Chimera", "Grizzly Bears"] }, [{ hand: ["Murder"], board: [...SWAMPS, "Hill Giant"] }]);
  const [chimera, bears, giant, murder] = [one(s0, "Perplexing Chimera"), one(s0, "Grizzly Bears"), one(s0, "Hill Giant"), one(s0, "Murder")];
  let s = playUntil(s0, (x) => x.activePlayer === 1 && x.step === "main1" && x.priority === 1 && x.stack.length === 0 && !x.pending);
  for (const a of planCast(s, 1, murder, [{ kind: "object", id: bears }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "chooseMay" && x.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Perplexing Chimera");
  await bar.getByRole("button", { name: "Yes", exact: true }).click();
  const retarget = await resolveUntil(page, (x) => x.pending?.kind === "newTargets" && x.pending.player === 0);
  // The exchange came first: Murder is yours, the Chimera Ana's.
  expect(retarget.stack.find((x) => x.objectId === murder)?.controller).toBe(0);
  expect(controllerOf(retarget, retarget.objects[chimera]!)).toBe(1);
  await expect(page.locator(".targeting")).toContainText("Perplexing Chimera: new targets for Murder");
  await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[giant]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(controllerOf(after, after.objects[chimera]!)).toBe(1);
  expect(after.players[1]!.graveyard).toContain(murder);
  expect(pageErrors(page)).toEqual([]);
});

test("Sudden Substitution: in answer to Ana's Murder at your Grizzly Bears, click Murder, then your Bears, then her Hill Giant as Murder's new target", async ({ page }) => {
  const s0 = scene({ hand: ["Sudden Substitution"], board: [...LANDS, "Grizzly Bears"] }, [{ hand: ["Murder"], board: [...SWAMPS, "Hill Giant"] }]);
  const [bears, giant, murder] = [one(s0, "Grizzly Bears"), one(s0, "Hill Giant"), one(s0, "Murder")];
  let s = playUntil(s0, (x) => x.activePlayer === 1 && x.step === "main1" && x.priority === 1 && x.stack.length === 0 && !x.pending);
  for (const a of planCast(s, 1, murder, [{ kind: "object", id: bears }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.priority === 0 && x.stack.length === 1 && !x.pending);
  const item = s.stack[0]!.id;
  await open(page, s);
  await card(page, "Sudden Substitution", s).click();
  await expect(page.locator(".targeting")).toContainText("target noncreature spell");
  await page.locator(`[data-stack="${item}"]`).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const retarget = await resolveUntil(page, (x) => x.pending?.kind === "newTargets" && x.pending.player === 0);
  // Murder is yours and your Bears are Ana's.
  expect(retarget.stack.find((x) => x.objectId === murder)?.controller).toBe(0);
  expect(controllerOf(retarget, retarget.objects[bears]!)).toBe(1);
  await expect(page.locator(".targeting")).toContainText("Sudden Substitution: new targets for Murder");
  await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[giant]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(controllerOf(after, after.objects[bears]!)).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
