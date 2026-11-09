// Lane B round B154 in the browser: Faces of the Past's choice as it resolves, after Ana's Llanowar Elves dies: tap all
// untapped creatures that share a creature type with it, or untap all tapped ones.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Faces of the Past: your Lightning Bolt kills Ana's Llanowar Elves; you click Untap and your tapped Elvish Mystic untaps", async ({ page }) => {
  let s: GameState = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Faces of the Past", "Elvish Mystic"] }, [{ board: ["Llanowar Elves", "Elvish Warrior", "Grizzly Bears"] }]);
  const [llanowar, mystic, warrior, bears] = [one(s, "Llanowar Elves"), one(s, "Elvish Mystic"), one(s, "Elvish Warrior"), one(s, "Grizzly Bears")];
  s.objects[mystic]!.tapped = true;
  for (const a of planCast(s, 0, one(s, "Lightning Bolt"), [{ kind: "object", id: llanowar }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "either" && x.pending.player === 0);
  expect(s.objects[llanowar]!.zone).toBe("graveyard");
  await open(page, s);
  await expect(controls(page)).toContainText("Faces of the Past");
  await expect(controls(page).getByRole("button", { name: "Tap all untapped creatures that share a creature type with it" })).toBeVisible();
  await controls(page).getByRole("button", { name: "Untap all tapped creatures that share a creature type with it" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && !x.objects[mystic]!.tapped);
  // Ana's Elvish Warrior (an Elf) stays untapped, and her Grizzly Bears shares no creature type.
  expect(after.objects[warrior]!.tapped).toBe(false);
  expect(after.objects[bears]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Faces of the Past: you click Tap, and Ana's untapped Elvish Warrior taps; her Grizzly Bears doesn't", async ({ page }) => {
  let s: GameState = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Faces of the Past"] }, [{ board: ["Llanowar Elves", "Elvish Warrior", "Grizzly Bears"] }]);
  const [llanowar, warrior, bears] = [one(s, "Llanowar Elves"), one(s, "Elvish Warrior"), one(s, "Grizzly Bears")];
  for (const a of planCast(s, 0, one(s, "Lightning Bolt"), [{ kind: "object", id: llanowar }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "either" && x.pending.player === 0);
  await open(page, s);
  await controls(page).getByRole("button", { name: "Tap all untapped creatures that share a creature type with it" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[warrior]!.tapped);
  expect(after.objects[bears]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});
