// Round 434: craft with "two that share a card type" (Eye of Ojer Taq: Done only once the two picks share one; Apex
// Observatory then asks for a card type the two exiled cards share, and its {T} makes the next spell of that type free)
// and "four or more nonlands with activated abilities" (The Enigma Jewel: no lands or cards without one offered; Locus of
// Enlightenment activates a crafted card's ability and copies it).
import { expect, test } from "@playwright/test";
import { abilitiesOf, applyAction, planActivate, type Action, type CostChoices, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
const craftIndex = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.keyword === "Craft");

test("Eye of Ojer Taq: craft with two that share a card type, then choose the type they share as Apex Observatory enters", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Eye of Ojer Taq // Apex Observatory", "Grizzly Bears"], yard: ["Hill Giant", "Lightning Bolt"] });
  const [eye, bears, giant, bolt] = [one(s, "Eye of Ojer Taq"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Lightning Bolt")];
  await open(page, s);
  await card(page, "Eye of Ojer Taq", s).click();
  const craft = menu(page).getByRole("button", { name: /^Craft/ });
  if (await craft.count()) await craft.click();
  const pick = modal(page);
  await expect(pick).toContainText("craft: exile two that share a card type you control or from your graveyard");
  const done = pick.getByRole("button", { name: "Done" });
  // A creature and an instant share no card type: not yet.
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await expect(done).toBeDisabled();
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.locator(`[data-pick="${giant}"]`).click();
  await expect(done).toBeEnabled();
  await done.click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "cardType");
  const bar = controls(page);
  await expect(bar).toContainText("choose a card type shared among two exiled cards used to craft it");
  await expect(bar.getByRole("button", { name: "Artifact", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Creature", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[eye]!.chosen?.cardType === "Creature");
  expect(after.objects[eye]!.face).toBe(1);
  expect(after.objects[eye]!.tapped).toBe(true);
  expect([after.objects[bears]!.zone, after.objects[giant]!.zone, after.objects[bolt]!.zone]).toEqual(["exile", "exile", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Apex Observatory: tap it, then cast the next creature spell without paying its mana cost", async ({ page }) => {
  let s = scene({ hand: ["Colossal Dreadmaw"], board: [...LANDS, "Eye of Ojer Taq // Apex Observatory", "Grizzly Bears"], yard: ["Hill Giant"] });
  const [eye, dreadmaw] = [one(s, "Eye of Ojer Taq"), one(s, "Colossal Dreadmaw")];
  s = run(s, planActivate(s, 0, eye, craftIndex(s, eye), undefined, undefined, undefined, undefined, { craft: [one(s, "Grizzly Bears"), one(s, "Hill Giant")] } as CostChoices));
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  s = applyAction(s, { type: "chooseOption", player: 0, choice: "Creature" });
  s = playUntil(s, (st) => !st.pending && st.stack.length === 0 && st.activePlayer === 0 && st.step === "main1");
  for (const id of s.battlefield) s.objects[id]!.tapped = false;
  await open(page, s);
  await page.locator(`[data-obj="${eye}"]`).first().click();
  const tapIt = menu(page).getByRole("button", { name: /next spell/ });
  if (await tapIt.count()) await tapIt.click();
  // The state the poll saw, not a later one.
  let mid = s;
  await expect
    .poll(async () => {
      mid = await state(page);
      return (mid.nextCast ?? []).length;
    })
    .toBe(1);
  expect(mid.objects[eye]!.tapped).toBe(true);
  await card(page, "Colossal Dreadmaw", mid).click();
  await menu(page).getByRole("button", { name: "Cast it: without paying its mana cost" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[dreadmaw]!.zone === "battlefield");
  // No land was tapped for it.
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped && after.cards[after.objects[id]!.cardId]!.types.includes("Land"))).toHaveLength(0);
  expect(pageErrors(page)).toEqual([]);
});

test("The Enigma Jewel: craft with four nonlands with activated abilities; Locus of Enlightenment's borrowed ping is copied", async ({ page }) => {
  const s = scene({ board: [...LANDS, "The Enigma Jewel // Locus of Enlightenment", "Prodigal Pyromancer"], yard: ["Llanowar Elves", "Shivan Dragon", "Hieroglyphic Illumination", "Divination"] });
  const jewel = one(s, "The Enigma Jewel");
  const mats = ["Prodigal Pyromancer", "Llanowar Elves", "Shivan Dragon", "Hieroglyphic Illumination"].map((n) => one(s, n));
  const life = s.players[1]!.life;
  await open(page, s);
  await card(page, "The Enigma Jewel", s).click();
  const craft = menu(page).getByRole("button", { name: /^Craft/ });
  if (await craft.count()) await craft.click();
  const pick = modal(page);
  await expect(pick).toContainText("craft: exile 4 or more nonlands with activated abilities you control or from your graveyard");
  // No lands, nothing without an activated ability.
  await expect(pick.locator(`[data-pick="${one(s, "Divination")}"]`)).toHaveCount(0);
  await expect(pick.locator(`[data-pick="${one(s, "Forest")}"]`)).toHaveCount(0);
  const done = pick.getByRole("button", { name: "Done" });
  for (const id of mats.slice(0, 3)) await pick.locator(`[data-pick="${id}"]`).click();
  await expect(done).toBeDisabled();
  await pick.locator(`[data-pick="${mats[3]}"]`).click();
  await expect(done).toBeEnabled();
  await done.click();
  const crafted = await resolveUntil(page, (st) => st.objects[jewel]!.face === 1 && st.stack.length === 0 && !st.pending);
  for (const id of mats) expect(crafted.objects[id]!.zone).toBe("exile");
  await page.locator(`[data-obj="${jewel}"]`).first().click();
  await menu(page).getByRole("button", { name: /deals 1 damage to any target/ }).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets");
  await page.locator(".targeting").getByRole("button", { name: /^Keep target/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === life - 2);
  expect(after.objects[jewel]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
