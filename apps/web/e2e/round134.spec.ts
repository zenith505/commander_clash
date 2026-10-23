// Round 134's prompts: the players Sower of Discord chose, shown on the card; Prisoner's Dilemma's secret choice;
// Skullwinder's opponent who gets a card back; Haunting Voyage's creature type (its graveyard's types offered first) and
// cards; Screaming Nemesis's "any other target".
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Sower of Discord: the card shows the two players chosen", async ({ page }) => {
  const s = scene({ board: ["Sower of Discord"] });
  s.objects[one(s, "Sower of Discord")]!.chosen = { players: [1, 2] };
  await open(page, s);
  await expect(page.locator(".chip.chosen", { hasText: "Ana, Ben" })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test("Prisoner's Dilemma: Ana casts it; you secretly choose silence, the bots snitch, and you take 12", async ({ page }) => {
  const s = scene({}, [{ hand: ["Prisoner's Dilemma"], board: LANDS }], { step: "end" });
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "word" && st.pending.player === 0, 200);
  const bar = controls(page);
  await expect(bar).toContainText("secretly choose silence or snitch");
  // The others' choices stay hidden until everyone has chosen.
  const before = await state(page);
  expect(before.log.some((l) => /secretly chooses/.test(l.text))).toBe(true);
  expect(before.log.some((l) => /revealed/.test(l.text))).toBe(false);
  await bar.getByRole("button", { name: "Silence", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.log.some((l) => /The choices are revealed/.test(l.text)), 200);
  expect(after.players[0]!.life).toBe(28);
  expect([after.players[2]!.life, after.players[3]!.life]).toEqual([40, 40]);
  expect(pageErrors(page)).toEqual([]);
});

test("Skullwinder: return your Grizzly Bears, then choose Ben, who takes a card back from his graveyard", async ({ page }) => {
  const s = scene({ hand: ["Skullwinder"], board: LANDS, yard: ["Grizzly Bears"] }, [{}, { yard: ["Lightning Bolt"] }]);
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Skullwinder", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  await modal(page).locator(`[data-pick="${bears}"]`).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent");
  const bar = controls(page);
  await expect(bar).toContainText("choose an opponent");
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  // Ben (a bot) chooses which of his cards.
  const yard = asked.players[2]!.graveyard;
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[2]!.graveyard.length < yard.length);
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(yard.filter((id) => after.objects[id]!.zone === "hand")).toHaveLength(1);
  expect(after.players[1]!.graveyard).toEqual(asked.players[1]!.graveyard);
  expect(pageErrors(page)).toEqual([]);
});

test("Haunting Voyage: Zombie, offered from the graveyard, then two of the three Zombies back", async ({ page }) => {
  const s = scene({ hand: ["Haunting Voyage"], board: LANDS, yard: ["Gravecrawler", "Diregraf Ghoul", "Walking Corpse", "Hill Giant"] });
  const zombies = [one(s, "Gravecrawler"), one(s, "Diregraf Ghoul"), one(s, "Walking Corpse")];
  await open(page, s);
  await card(page, "Haunting Voyage", s).click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "creatureType");
  const types = modal(page);
  await expect(types).toContainText("Haunting Voyage: choose a creature type");
  await expect(types.getByRole("button", { name: /^Zombie 3 in your graveyard$/ })).toBeVisible();
  await types.getByRole("button", { name: /^Zombie 3 in your graveyard$/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${one(s, "Hill Giant")}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${zombies[0]}"]`).click();
  await pick.locator(`[data-pick="${zombies[2]}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(zombies.map((z) => after.objects[z]!.zone)).toEqual(["battlefield", "graveyard", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Screaming Nemesis: Lightning Bolt it, it deals 3 to Ana, who can't gain life any more", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Screaming Nemesis"] });
  const nemesis = one(s, "Screaming Nemesis");
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await page.locator(`[data-obj="${nemesis}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.objects[nemesis]!.zone === "graveyard");
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[1]!.life).toBe(37);
  expect(after.players[1]!.cantGainLifeForGame).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
