// Round 328's prompts: Master of the Wild Hunt's target is your creature, so you divide its damage among the Wolves its
// ability tapped, with − and + for each, then Done; Island Sanctuary offers to skip your draw-step draw.
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, type GameState } from "@cc/engine";
import { one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Master of the Wild Hunt: Ana's Wolves hit your Craw Wurm, and you divide its 6 damage between them", async ({ page }) => {
  let s: GameState = scene({ board: ["Craw Wurm"] }, [{ board: ["Master of the Wild Hunt", "Russet Wolves", "Watchwolf"] }]);
  const [wurm, master, russet, watch] = [one(s, "Craw Wurm"), one(s, "Master of the Wild Hunt"), one(s, "Russet Wolves"), one(s, "Watchwolf")];
  // You pass; Ana activates it targeting your Craw Wurm.
  s = applyAction(s, { type: "passPriority", player: 0 });
  for (const a of planActivate(s, 1, master, 0, [{ kind: "object", id: wurm }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "divideDamage" && x.pending.player === 0);
  expect(s.pending).toMatchObject({ total: 6 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Master of the Wild Hunt: divide Craw Wurm's 6 damage among any number of these creatures (6 left)");
  const done = bar.getByRole("button", { name: "Done" });
  await expect(done).toBeDisabled();
  const plus = (id: string) => page.locator(`[data-divide-damage="${id}"]`).getByRole("button", { name: "+" });
  for (let i = 0; i < 3; i++) await plus(russet).click();
  for (let i = 0; i < 3; i++) await plus(watch).click();
  await expect(bar).toContainText("(0 left)");
  await done.click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[wurm]!.zone === "graveyard");
  expect(after.objects[russet]!.zone).toBe("graveyard");
  expect(after.objects[watch]!.zone).toBe("graveyard");
  expect(after.log.some((l) => /divides Craw Wurm.s 6 damage: 3 to Russet Wolves, 3 to Watchwolf/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Island Sanctuary: skip your draw-step draw, and until your next turn only fliers and islandwalkers can attack you", async ({ page }) => {
  let s: GameState = scene({ board: ["Island Sanctuary"] }, [], { step: "upkeep" });
  const sanctuary = one(s, "Island Sanctuary");
  s = playUntil(s, (x) => x.pending?.kind === "drawInstead" && x.pending.player === 0);
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Skip this draw; until your next turn you can't be attacked except by creatures with flying and/or islandwalk (Island Sanctuary)");
  await bar.getByRole("button", { name: /^Skip this draw; until your next turn/ }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.step !== "draw" && x.step !== "upkeep");
  expect(after.players[0]!.hand.length).toBe(hand);
  expect(after.players[0]!.attackOnlyByUntil).toEqual(["Flying", "Islandwalk"]);
  expect(after.objects[sanctuary]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
