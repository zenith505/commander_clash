// Round 258's prompts: Chaos Defiler (you choose a nonland permanent of each opponent's; one of them is destroyed at
// random), Winnowing (you choose a creature for each player to keep, with those sharing a creature type with it) and
// Fiery Gambit ("flip again?" after each flip won).
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Chaos Defiler: choose Ana's Hill Giant and Ben's Sol Ring (Cy's Gray Ogre is her only one); one of the three is destroyed", async ({ page }) => {
  const s = scene({ hand: ["Chaos Defiler"], board: LANDS }, [{ board: ["Grizzly Bears", "Hill Giant"] }, { board: ["Sol Ring", "Llanowar Elves"] }, { board: ["Gray Ogre"] }]);
  const [bears, giant, ring, elves, ogre] = ["Grizzly Bears", "Hill Giant", "Sol Ring", "Llanowar Elves", "Gray Ogre"].map((n) => one(s, n)) as [string, string, string, string, string];
  await open(page, s);
  await card(page, "Chaos Defiler", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0 && st.pending.of === 1);
  const bar = controls(page);
  await expect(bar).toContainText("Chaos Defiler: click a nonland permanent of Ana's. Chaos Defiler destroys one of the chosen permanents at random.");
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0 && st.pending.of === 2);
  await expect(bar).toContainText("click a nonland permanent of Ben's.");
  await page.locator(`[data-obj="${ring}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && [giant, ring, ogre].some((id) => st.objects[id]!.zone === "graveyard"));
  expect([giant, ring, ogre].filter((id) => after.objects[id]!.zone === "graveyard").length).toBe(1);
  expect([after.objects[bears]!.zone, after.objects[elves]!.zone]).toEqual(["battlefield", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Winnowing: keep Llanowar Elves (Elvish Mystic stays, Goblin Guide goes) and Ana's Grizzly Bears (Runeclaw Bear stays, Hill Giant goes)", async ({ page }) => {
  const s = scene({ hand: ["Winnowing"], board: [...LANDS, "Llanowar Elves", "Elvish Mystic", "Goblin Guide"] }, [{ board: ["Grizzly Bears", "Runeclaw Bear", "Hill Giant"] }]);
  const [llanowar, mystic, guide, bears, runeclaw, giant] = ["Llanowar Elves", "Elvish Mystic", "Goblin Guide", "Grizzly Bears", "Runeclaw Bear", "Hill Giant"].map((n) => one(s, n)) as [string, string, string, string, string, string];
  await open(page, s);
  await card(page, "Winnowing", s).click();
  // Convoke is offered; pay with lands only.
  await page.locator(".targeting", { hasText: "Convoke Winnowing" }).getByRole("button", { name: "Cast with mana" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0 && st.pending.action === "keep" && st.pending.of === undefined);
  const bar = controls(page);
  await expect(bar).toContainText("Winnowing: click a creature of yours to keep. The rest that share no creature type with it are sacrificed.");
  await page.locator(`[data-obj="${llanowar}"]`).click();
  await bar.getByRole("button", { name: "Keep 1" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0 && st.pending.of === 1);
  await expect(bar).toContainText("click a creature for Ana to keep. The rest that share no creature type with it are sacrificed.");
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Keep 1" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect([llanowar, mystic, guide, bears, runeclaw].map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "battlefield", "graveyard", "battlefield", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});

/** Fiery Gambit cast at Ana's Hill Giant, played in the engine up to the first "flip again?" (a seed whose first flip is won). */
function gambitScene(): { s: GameState; giant: string } {
  for (let seed = 1; seed < 200; seed++) {
    let s = scene({ hand: ["Fiery Gambit"], board: LANDS }, [{ board: ["Hill Giant"] }]);
    const [gambit, giant] = [one(s, "Fiery Gambit"), one(s, "Hill Giant")];
    s.rngState = seed;
    for (const a of planCast(s, 0, gambit, [{ kind: "object", id: giant }])!) s = applyAction(s, a);
    s = playUntil(s, (st) => st.pending?.kind === "chooseMay" || st.objects[gambit]!.zone === "graveyard");
    if (s.pending?.kind === "chooseMay" && s.pending.flipAgain) return { s, giant };
  }
  throw new Error("no seed");
}

test("Fiery Gambit: win the first flip, then stop flipping: 3 damage to Ana's Hill Giant, nothing else", async ({ page }) => {
  const { s, giant } = gambitScene();
  const life = s.players[1]!.life;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Fiery Gambit: you've won a flip. Flip another coin? If you lose a flip, Fiery Gambit has no effect.");
  await expect(bar.getByRole("button", { name: "Flip again" })).toBeVisible();
  await bar.getByRole("button", { name: "Stop flipping" }).click();
  // Hill Giant is a 3/3: it dies.
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(life);
  expect(after.log.some((x) => /stops flipping coins for Fiery Gambit: 1 won/.test(x.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
