// Lane B round B157 in the browser: Break Out's look at six, the creature card you reveal and then, with mana value 2 or
// less, the choice of the battlefield (with haste) or your hand.
import { expect, test } from "@playwright/test";
import { applyAction, objHasKeyword, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, modal, resolveUntil } from "./ui";

test("Break Out: you reveal Llanowar Elves from the top six and put it onto the battlefield with haste", async ({ page }) => {
  let s: GameState = scene({ hand: ["Break Out"], board: LANDS, library: ["Llanowar Elves", "Hill Giant", "Swamp", "Island", "Plains", "Mountain"] });
  const [spell, elves, giant] = [one(s, "Break Out"), one(s, "Llanowar Elves"), one(s, "Hill Giant")];
  for (const a of planCast(s, 0, spell)!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  await open(page, s);
  const pick = modal(page);
  await pick.locator(`[data-pick="${elves}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "either" && x.pending.player === 0);
  const bar = controls(page);
  await expect(bar.getByRole("button")).toHaveText(["Put Llanowar Elves onto the battlefield", "Put Llanowar Elves into your hand"]);
  await bar.getByRole("button", { name: "Put Llanowar Elves onto the battlefield" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[spell]!.zone === "graveyard");
  expect(after.objects[elves]!.zone).toBe("battlefield");
  expect(objHasKeyword(after, after.objects[elves]!, "Haste")).toBe(true);
  // The rest went to the bottom.
  expect(after.players[0]!.library.slice(-5)).toContain(giant);
  expect(pageErrors(page)).toEqual([]);
});
