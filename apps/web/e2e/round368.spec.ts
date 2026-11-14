// Round 368: Gorex, the Tombshell's "exile any number of creature cards from your graveyard" as it's cast (X, then the
// cards); Three Dog, Galaxy News DJ's "you may pay {2} and sacrifice an Aura attached to ~" when you attack; and Codie,
// Vociferous Codex's mana for the next spell.
import { expect, test } from "@playwright/test";
import { applyAction, invalidateCharacteristics, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Gorex, the Tombshell: X = 3 creature cards exiled from your graveyard, then {B}{B} from two Swamps", async ({ page }) => {
  const s = scene({ hand: ["Gorex, the Tombshell"], board: ["Swamp", "Swamp", "Plains"], yard: ["Grizzly Bears", "Hill Giant", "Gray Ogre", "Shock"] });
  const gorex = one(s, "Gorex, the Tombshell");
  const [bears, giant, ogre, shock] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Gray Ogre"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Gorex, the Tombshell", s).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("exile X creature cards from your graveyard, each making it {2} cheaper: choose X");
  // Two Swamps and a Plains: {B}{B} and one more mana, so at least three cards ({6} off).
  await expect(x.getByLabel("X", { exact: true })).toHaveValue("3");
  await x.getByRole("button", { name: "X = 3" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Gorex, the Tombshell: exile from your graveyard 3 creature cards");
  await expect(pick.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  for (const id of [bears, giant, ogre]) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[gorex]!.zone === "battlefield");
  expect([bears, giant, ogre].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
  expect(after.objects[shock]!.zone).toBe("graveyard");
  // {B}{B} only: the Plains stays untapped.
  expect(after.objects[idsOf(s, "Plains", "battlefield", 0)[0]!]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Three Dog, Galaxy News DJ: you attack, pay {2} and sacrifice Holy Strength; Grizzly Bears gets a copy", async ({ page }) => {
  const s0 = scene({ board: ["Plains", "Island", "Three Dog, Galaxy News DJ", "Holy Strength", "Grizzly Bears"] });
  const [dog, holy, bears] = [one(s0, "Three Dog, Galaxy News DJ"), one(s0, "Holy Strength"), one(s0, "Grizzly Bears")];
  s0.objects[holy]!.attachedTo = dog;
  invalidateCharacteristics(s0);
  let s = playUntil(s0, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: bears, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("and sacrifice an Aura attached to Three Dog, Galaxy News DJ?");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.isToken && st.objects[id]!.attachedTo === bears));
  expect(after.objects[holy]!.zone).toBe("graveyard");
  expect([...idsOf(s0, "Plains", "battlefield", 0), ...idsOf(s0, "Island", "battlefield", 0)].map((id) => after.objects[id]!.tapped)).toEqual([true, true]);
  expect(pageErrors(page)).toEqual([]);
});

test("Codie, Vociferous Codex: tap it for {W}{U}{B}{R}{G}, cast Divination, and Shock is found to cast for free", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Codie, Vociferous Codex"], hand: ["Divination"], library: ["Hill Giant", "Shock"] });
  const [codie, shock] = [one(s, "Codie, Vociferous Codex"), one(s, "Shock")];
  await open(page, s);
  await page.locator(`[data-obj="${codie}"]`).click();
  await menu(page).getByRole("button", { name: /add W U B R G/ }).click();
  let st: GameState | undefined;
  await expect.poll(async () => ((st = await state(page)), st.objects[codie]!.tapped)).toBe(true);
  expect(st!.players[0]!.manaPool).toMatchObject({ W: 1, U: 1, B: 1, R: 1, G: 1 });
  await card(page, "Divination", s).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[shock]!.zone === "exile");
  expect(after.objects[shock]!.mayPlay?.free).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
