// Lane B round B160 in the browser: Stronghold Gambit's choice of a card in your hand (each player chooses before any is
// revealed, then the lowest creature cards enter), and Clarion Ultimatum's five permanents chosen, then a card with each
// one's name found and put onto the battlefield tapped.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, modal, resolveUntil } from "./ui";

test("Stronghold Gambit: you choose Llanowar Elves, Ana chooses Grizzly Bears; only the Elves (mana value 1) enter", async ({ page }) => {
  let s: GameState = scene({ hand: ["Stronghold Gambit", "Hill Giant", "Llanowar Elves"], board: LANDS }, [{ hand: ["Grizzly Bears"] }]);
  const [spell, elves, giant, bears] = [one(s, "Stronghold Gambit"), one(s, "Llanowar Elves"), one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  for (const a of planCast(s, 0, spell)!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  expect(s.pending).toMatchObject({ fromHand: true, min: 1, max: 1 });
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("reveal a card from your hand");
  await pick.locator(`[data-pick="${elves}"]`).first().click();
  await pick.getByRole("button", { name: "Reveal", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[spell]!.zone === "graveyard");
  expect(after.objects[elves]!.zone).toBe("battlefield");
  expect(after.objects[giant]!.zone).toBe("hand");
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(after.log.some((l) => /reveals Grizzly Bears/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Clarion Ultimatum: you choose Hill Giant and four lands, then find a Hill Giant and a Snow-Covered Plains, which enter tapped", async ({ page }) => {
  // Lands of one name share a pile: the ones to choose have names of their own.
  const pay = ["Plains", "Plains", "Plains", "Island", "Island", "Forest", "Forest"];
  let s: GameState = scene({ hand: ["Clarion Ultimatum"], board: [...pay, "Hill Giant", "Swamp", "Mountain", "Wastes", "Snow-Covered Plains"], library: ["Hill Giant", "Snow-Covered Plains", "Grizzly Bears"] });
  const spell = one(s, "Clarion Ultimatum");
  const giantHere = idsOf(s, "Hill Giant", "battlefield", 0)[0]!;
  for (const a of planCast(s, 0, spell)!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "pickPermanents" && x.pending.player === 0);
  const picks = [giantHere, ...["Swamp", "Mountain", "Wastes", "Snow-Covered Plains"].map((n) => idsOf(s, n, "battlefield", 0)[0]!)];
  await open(page, s);
  for (const id of picks) await page.locator(`[data-obj="${id}"]`).first().click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  const searching = await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  const [giantLib, plainsLib] = [idsOf(searching, "Hill Giant", "library", 0)[0]!, idsOf(searching, "Snow-Covered Plains", "library", 0)[0]!];
  const pick = modal(page);
  await pick.locator(`[data-pick="${giantLib}"]`).first().click();
  await pick.locator(`[data-pick="${plainsLib}"]`).first().click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[spell]!.zone === "graveyard");
  for (const id of [giantLib, plainsLib]) {
    expect(after.objects[id]!.zone).toBe("battlefield");
    expect(after.objects[id]!.tapped).toBe(true);
  }
  expect(after.objects[idsOf(after, "Grizzly Bears", "library", 0)[0]!]!.zone).toBe("library");
  expect(pageErrors(page)).toEqual([]);
});
