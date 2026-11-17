// Round 378: someone other than the defending player declaring the blocks. Brutal Hordechief's activation and the blocks
// you then declare for Ana (her creatures must block), Invasion Plans' blocks you declare as the attacking player, and
// Berserker's Frenzy's "choose any number of creatures" pick (anyone's, then they must block).
import { expect, test } from "@playwright/test";
import { applyAction, nextRandom, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, controls, menu, resolveUntil } from "./ui";

/** The next d20s rolled come up `values` (the game's seeded random numbers, CR 706.1b). */
function rig(s: GameState, values: number[]) {
  for (let st = 1; ; st++) {
    const t = { rngState: st };
    if (values.every((v) => 1 + Math.floor(nextRandom(t) * 20) === v)) {
      s.rngState = st;
      return;
    }
  }
}

test("Brutal Hordechief: activate it, attack Ana, then declare her blocks: her creature must block", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Brutal Hordechief", "Hill Giant"] }, [{ board: ["Grizzly Bears"] }]);
  const [chief, giant, bears] = [one(s, "Brutal Hordechief"), one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${chief}"]`).click();
  if (await menu(page).count()) await menu(page).locator("button", { hasText: "Creatures your opponents control block this turn" }).click();
  const resolved = await resolveUntil(page, (st) => !!st.blocksChosenThisTurn?.length && st.stack.length === 0 && st.pending?.kind === "declareAttackers");
  expect(resolved.blocksChosenThisTurn![0]).toMatchObject({ player: 0, opponents: true });
  await attack(page, [[giant, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 0);
  const bar = controls(page);
  // Grizzly Bears must block: no "No blocks" until it does.
  await expect(bar).toContainText("Grizzly Bears must block this turn if able.");
  await expect(bar.getByRole("button", { name: "No blocks" })).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).click();
  await expect(bar).toContainText("Now click the attacker Grizzly Bears blocks.");
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Block with 1" }).click();
  const after = await resolveUntil(page, (st) => st.pending?.kind !== "declareBlockers" && st.objects[bears]!.blocking !== undefined);
  expect(after.objects[bears]!.blocking).toEqual([giant]);
  expect(after.log.some((l) => l.text === "Grizzly Bears blocks Hill Giant (You chose).")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Invasion Plans: you're the attacking player, so you declare Ana's blocks", async ({ page }) => {
  let s = scene({ board: ["Invasion Plans", "Hill Giant", "Gray Ogre"] }, [{ board: ["Grizzly Bears"] }]);
  const [giant, ogre, bears] = [one(s, "Hill Giant"), one(s, "Gray Ogre"), one(s, "Grizzly Bears")];
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers");
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [giant, ogre].map((attacker) => ({ attacker, defender: 1 })) });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers");
  expect(s.pending).toMatchObject({ player: 0, defender: 1 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Grizzly Bears must block this turn if able.");
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${ogre}"]`).click();
  await expect(bar).toContainText("You choose Ana's blocks");
  await bar.getByRole("button", { name: "Block with 1" }).click();
  const after = await resolveUntil(page, (st) => st.pending?.kind !== "declareBlockers" && st.objects[bears]!.blocking !== undefined);
  expect(after.objects[bears]!.blocking).toEqual([ogre]);
  expect(pageErrors(page)).toEqual([]);
});

test("Berserker's Frenzy: roll 11, choose Ana's Grizzly Bears; it must block", async ({ page }) => {
  const s = scene({ hand: ["Berserker's Frenzy"], board: [...LANDS, "Hill Giant"] }, [{ board: ["Grizzly Bears", "Gray Ogre"] }]);
  const [giant, bears, ogre] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Gray Ogre")];
  rig(s, [11, 4]);
  await open(page, s);
  await card(page, "Berserker's Frenzy", s).click();
  const pick = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  expect(pick.pending?.kind === "pickPermanents" && pick.pending.options).toEqual(expect.arrayContaining([giant, bears, ogre]));
  const bar = controls(page);
  await expect(bar).toContainText("they block this turn if able");
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.effects.some((e) => e.affected?.includes(bears)));
  expect(after.effects.some((e) => e.affected?.includes(ogre))).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Berserker's Frenzy: roll 18, then you declare Ana's blocks, none if you like", async ({ page }) => {
  const s = scene({ hand: ["Berserker's Frenzy"], board: [...LANDS, "Hill Giant"] }, [{ board: ["Grizzly Bears"] }]);
  const [giant, bears] = [one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  rig(s, [18, 4]);
  await open(page, s);
  await card(page, "Berserker's Frenzy", s).click();
  await resolveUntil(page, (st) => !!st.blocksChosenThisTurn?.length && st.stack.length === 0 && st.pending?.kind === "declareAttackers");
  await attack(page, [[giant, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("You choose Ana's blocks: click one of their untapped creatures, then the attacker it blocks.");
  await bar.getByRole("button", { name: "No blocks" }).click();
  const after = await resolveUntil(page, (st) => st.pending?.kind !== "declareBlockers" && st.step !== "declareAttackers");
  expect(after.objects[bears]!.blocking).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});
