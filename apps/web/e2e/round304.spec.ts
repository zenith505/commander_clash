// Round 304's prompts: Green Sun's Twilight with X 5 or more (a creature card and a land card, then onto the battlefield
// or into your hand), Exterminate!'s replicate paid by tapping Daleks (how many times, then which Daleks), and Invoke
// Justice's counters divided among another player's creatures as it resolves.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Green Sun's Twilight with X 5: Grizzly Bears and Forest, then both onto the battlefield", async ({ page }) => {
  const s0 = scene({ hand: ["Green Sun's Twilight"], board: LANDS, library: ["Grizzly Bears", "Lightning Bolt", "Island", "Divination", "Forest", "Divination"] });
  const lib = s0.players[0]!.library;
  const [bears, bolt, forest] = [lib[0]!, lib[1]!, lib[4]!];
  const s = passToPrompt(run(s0, planCast(s0, 0, one(s0, "Green Sun's Twilight"), [], undefined, undefined, 5)));
  expect(s.pending).toMatchObject({ kind: "searchLibrary", player: 0, min: 1, max: 2 });
  await open(page, s);
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${bolt}"]`)).toHaveClass(/\bdim\b/);
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.locator(`[data-pick="${forest}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "either");
  expect(asked.pending).toMatchObject({ player: 0 });
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Put them into your hand" })).toBeVisible();
  await bar.getByRole("button", { name: /onto the battlefield$/ }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[forest]!.zone === "battlefield");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[bolt]!.zone).toBe("library");
  expect(pageErrors(page)).toEqual([]);
});

test("Exterminate!: replicate twice, tapping Dalek Squadron and Dalek Drone, destroys three creatures", async ({ page }) => {
  const s = scene({ hand: ["Exterminate!"], board: [...LANDS, "Dalek Squadron", "Dalek Drone"] }, [{ board: ["Grizzly Bears", "Hill Giant", "Gray Ogre"] }]);
  const [squadron, drone, bears, giant, ogre] = [one(s, "Dalek Squadron"), one(s, "Dalek Drone"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Gray Ogre")];
  const life = s.players[1]!.life;
  await open(page, s);
  await card(page, "Exterminate!", s).click();
  const kick = page.locator(".targeting", { hasText: "how many times?" });
  await expect(kick).toContainText("tap an untapped Dalek you control");
  await kick.getByRole("button", { name: "Kick one more time" }).click();
  await kick.getByRole("button", { name: "Kick one more time" }).click();
  // Only two Daleks: a third time can't be paid.
  await expect(kick.getByRole("button", { name: "Kick one more time" })).toBeDisabled();
  await kick.getByRole("button", { name: "Pay 2 times" }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const tap = page.locator(".targeting", { hasText: "Dalek" });
  await page.locator(`[data-obj="${squadron}"]`).click();
  await page.locator(`[data-obj="${drone}"]`).click();
  await tap.getByRole("button", { name: "Tap and cast" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets");
  await page.locator(`[data-obj="${giant}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.stack.some((it) => (it.targets ?? []).some((t) => t.kind === "object" && t.id === giant)));
  await page.locator(`[data-obj="${ogre}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ogre]!.zone === "graveyard");
  expect([bears, giant, ogre].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard"]);
  expect(after.objects[squadron]!.tapped && after.objects[drone]!.tapped).toBe(true);
  expect(after.players[1]!.life).toBe(life - 9);
  expect(pageErrors(page)).toEqual([]);
});

test("Invoke Justice: Hill Giant back, then the four counters divided between Ana's Grizzly Bears and Gray Ogre", async ({ page }) => {
  const s0 = scene({ hand: ["Invoke Justice"], board: LANDS, yard: ["Hill Giant"] }, [{ board: ["Grizzly Bears", "Gray Ogre"] }]);
  const [giant, bears, ogre] = [one(s0, "Hill Giant"), one(s0, "Grizzly Bears"), one(s0, "Gray Ogre")];
  s0.players[0]!.manaPool.W = 5;
  const s = passToPrompt(run(s0, planCast(s0, 0, one(s0, "Invoke Justice"), [{ kind: "object", id: giant }, { kind: "player", id: 1 }])));
  expect(s.pending).toMatchObject({ kind: "distribute", player: 0, total: 4 });
  expect([...(s.pending as { options: string[] }).options].sort()).toEqual([bears, ogre].sort());
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("(4 left)");
  const done = bar.getByRole("button", { name: "Done" });
  await expect(done).toBeDisabled();
  for (const id of [bears, bears, ogre, ogre]) await page.locator(`[data-distribute="${id}"]`).getByRole("button", { name: "+" }).click();
  await expect(bar).toContainText("(0 left)");
  await done.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[ogre]!.counters["+1/+1"] ?? 0) > 0);
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(2);
  expect(after.objects[ogre]!.counters["+1/+1"]).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});
