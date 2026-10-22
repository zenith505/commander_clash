// Round 122's prompts: a token put onto the battlefield attacking asks what it attacks (CR 508.4), one question per
// token; cleave (CR 702.148a) is a "Cleave" cast button; Warped Space offers {0} for a card cast from exile; Derevi's
// ability is in her command zone menu.
import { expect, test } from "@playwright/test";
import { applyAction } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil, seat } from "./ui";

test("Hero of Bladehold: each Soldier token asks whom it attacks; one attacks Ben, the other Ana", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Hero of Bladehold"] }, [{}, {}]);
  const hero = one(s, "Hero of Bladehold");
  // The attack is played in the engine; the test starts at the first token's question.
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers");
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: hero, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "attackWhom");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("choose what the Soldier token attacks (1 of 2)");
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  await expect(bar).toContainText("choose what the Soldier token attacks (2 of 2)");
  await bar.getByRole("button", { name: "Ana", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.battlefield.filter((id) => st.cards[st.objects[id]!.cardId]!.name === "Soldier Token").length === 2);
  const soldiers = after.battlefield.filter((id) => after.cards[after.objects[id]!.cardId]!.name === "Soldier Token");
  expect(soldiers.map((id) => after.objects[id]!.attacking).sort()).toEqual([1, 2]);
  expect(pageErrors(page)).toEqual([]);
});

test("Path of Peril: cast for its cleave cost, the brackets are gone: every creature is destroyed, not only the small ones", async ({ page }) => {
  const s = scene({ hand: ["Path of Peril"], board: LANDS }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Path of Peril", s).click();
  await menu(page).getByRole("button", { name: /^Cleave/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Path of Peril")]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.log.some((l) => /Path of Peril for its cleave cost/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Warped Space: a card you may play from exile is cast for {0}", async ({ page }) => {
  const s = scene({ board: ["Charred Foyer // Warped Space"], exile: ["Hill Giant"] });
  const room = one(s, "Charred Foyer // Warped Space");
  s.objects[room]!.unlocked = [1];
  const giant = one(s, "Hill Giant");
  // Exiled with permission to cast it this turn (as Charred Foyer's upkeep trigger would), and no lands to pay with.
  s.objects[giant]!.mayPlay = { player: 0, zc: s.objects[giant]!.zoneChanges ?? 0, until: "thisTurn", turn: s.turn };
  await open(page, s);
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: "Cast it for 0" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Derevi: the command zone ability puts her onto the battlefield without casting her (no commander tax)", async ({ page }) => {
  const s = scene({ commander: "Derevi, Empyrial Tactician", board: LANDS });
  const derevi = one(s, "Derevi, Empyrial Tactician");
  await open(page, s);
  await card(page, "Derevi, Empyrial Tactician", s).click();
  await menu(page).locator("button", { hasText: "onto the battlefield from the command zone" }).click();
  const after = await resolveUntil(page, (st) => st.objects[derevi]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.players[0]!.commanderCasts[derevi] ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
