// Lane B round 5's cards through existing prompts: Spider-Man, To the Rescue's "you may tap him" and then the target
// for its reflexive trigger, and paying for an opponent's Rhystic Deluge ("tap target creature unless its controller
// pays {1}").
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Spider-Man, To the Rescue: tap him, then click the creature that gains indestructible", async ({ page }) => {
  const s = scene({ hand: ["Spider-Man, To the Rescue"], board: [...LANDS, "Grizzly Bears"] });
  const [spidey, bears] = [one(s, "Spider-Man, To the Rescue"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Spider-Man, To the Rescue", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.objects[spidey]!.tapped === true);
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.effects.some((e) => e.affected?.includes(bears)));
  expect(after.objects[spidey]!.zone).toBe("battlefield");
  expect(after.effects.find((e) => e.affected?.includes(bears))?.mods).toEqual(expect.arrayContaining([{ kind: "addKeywords", keywords: ["Indestructible"] }]));
  expect(pageErrors(page)).toEqual([]);
});

/** Your opponent activates Rhystic Deluge on your Grizzly Bears; it's your call whether to pay {1}. */
function deluged(): { s: GameState; bears: string } {
  let s = scene({ board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Island", "Rhystic Deluge"] }]);
  const [bears, deluge] = [one(s, "Grizzly Bears"), one(s, "Rhystic Deluge")];
  s = applyAction(s, { type: "passPriority", player: 0 });
  expect(waitingOn(s)).toBe(1);
  for (const a of planActivate(s, 1, deluge, 0, [{ kind: "object", id: bears }])!) s = applyAction(s, a);
  for (let i = 0; i < 8 && !s.pending; i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return { s, bears };
}

test("Rhystic Deluge: pay {1} and your creature stays untapped", async ({ page }) => {
  const { s, bears } = deluged();
  expect(s.pending).toMatchObject({ kind: "payUnless", player: 0, cost: "{1}" });
  await open(page, s);
  await expect(controls(page)).toContainText("Rhystic Deluge:");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.tapped ?? false).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Rhystic Deluge: don't pay, and your creature is tapped", async ({ page }) => {
  const { s, bears } = deluged();
  await open(page, s);
  await controls(page).getByRole("button", { name: "Don't pay" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
