// Lane B round B221 in the browser: Cemetery Desecrator's pick from any graveyard, then its reflexive mode and target;
// Terminal Velocity's pick from your hand and its end-step sacrifice; Callous Oppressor's opponent (you choose Ana, who
// chooses the type) and its tap ability, and the creature type you choose for Ana's Oppressor; Storyweave's Saga mode.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, modal, passTo, resolveUntil } from "./ui";
import { applyAction, controllerOf, moveObject, runStateBasedActions, type GameState } from "@cc/engine";

const ctl = (s: GameState, id: string) => controllerOf(s, s.objects[id]!);

test("Cemetery Desecrator: Ana's Craw Wurm exiled from her graveyard, then Hill Giant gets -6/-6", async ({ page }) => {
  const s = scene({ hand: ["Cemetery Desecrator"], board: LANDS, yard: ["Llanowar Elves"] }, [{ board: ["Hill Giant"], yard: ["Craw Wurm"] }]);
  const [wurm, elves, giant] = [one(s, "Craw Wurm"), one(s, "Llanowar Elves"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Cemetery Desecrator", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  // Any graveyard: yours and Ana's.
  await expect(modal(page).locator(`[data-pick="${elves}"]`)).toHaveCount(1);
  await modal(page).locator(`[data-pick="${wurm}"]`).click();
  const done = modal(page).getByRole("button", { name: /^(Done|Exile|Take|Choose|Put)/ });
  if (await done.count()) await done.first().click();
  // The mode is chosen once the card is exiled (rulings).
  await resolveUntil(page, (st) => st.pending?.kind === "chooseModes" && st.pending.player === 0 && st.objects[wurm]!.zone === "exile");
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("Remove X counters from target permanent");
  await modes.getByRole("button", { name: /Target creature an opponent controls gets -X\/-X/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(after.objects[elves]!.zone).toBe("graveyard");
  expect(after.objects[wurm]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Terminal Velocity: Craw Wurm put from your hand with haste; at your end step it's sacrificed and deals 6 to each creature", async ({ page }) => {
  const s = scene({ hand: ["Terminal Velocity", "Craw Wurm", "Lightning Bolt"], board: LANDS }, [{ board: ["Hill Giant"] }]);
  const [wurm, bolt, giant] = [one(s, "Craw Wurm"), one(s, "Lightning Bolt"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Terminal Velocity", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  await expect(modal(page).locator(`[data-pick="${bolt}"]`)).toHaveCount(0);
  await modal(page).locator(`[data-pick="${wurm}"]`).click();
  const done = modal(page).getByRole("button", { name: /^(Done|Take|Choose|Put)/ });
  if (await done.count()) await done.first().click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[wurm]!.zone === "battlefield");
  const after = await passTo(page, "end");
  const gone = after.objects[wurm]!.zone === "graveyard" && after.objects[giant]!.zone === "graveyard" ? after : await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[wurm]!.zone === "graveyard" && st.objects[giant]!.zone === "graveyard");
  expect(gone.objects[bolt]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Callous Oppressor: you choose Ana, she chooses the type; next turn it takes her Hill Giant while it stays tapped", async ({ page }) => {
  const s = scene({ hand: ["Callous Oppressor"], board: LANDS }, [{ board: ["Goblin Piker", "Goblin Piker", "Hill Giant"] }]);
  const [oppressor, giant] = [one(s, "Callous Oppressor"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Callous Oppressor", s).click();
  const cast = menu(page).getByRole("button", { name: /^Cast it/ });
  if (await cast.count()) await cast.first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "player" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose an opponent");
  await bar.getByRole("button", { name: "Ana" }).click();
  // Ana, a bot, chooses the type: one her own creatures have.
  const chosen = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[oppressor]!.chosen?.type !== undefined);
  expect(["Goblin", "Warrior"]).toContain(chosen.objects[oppressor]!.chosen!.type);
  const next = playUntil(chosen, (st) => st.turn > chosen.turn && st.activePlayer === 0 && st.step === "main1" && !st.pending && st.stack.length === 0);
  await open(page, next);
  await page.locator(`[data-obj="${oppressor}"]`).first().click();
  const ability = menu(page).getByRole("button", { name: /Gain control of target creature that isn't of the chosen type/ });
  if (await ability.count()) await ability.first().click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && ctl(st, giant) === 0);
  expect(after.objects[oppressor]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Callous Oppressor: Ana chose you, so you choose the creature type for her Oppressor", async ({ page }) => {
  let s = scene({ board: ["Grizzly Bears"] }, [{ hand: ["Callous Oppressor"] }]);
  const oppressor = one(s, "Callous Oppressor");
  // Ana's Oppressor enters; she chooses you as the opponent (CR 614.12).
  moveObject(s, oppressor, "battlefield");
  runStateBasedActions(s);
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "player", player: 1 });
  s = applyAction(s, { type: "chooseOption", player: 1, choice: "0" });
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "creatureType", player: 0 });
  await open(page, s);
  const types = modal(page);
  await expect(types).toContainText("choose a creature type for Ana's Callous Oppressor");
  await types.locator('[data-type="Bear"]').first().click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[oppressor]!.chosen?.type === "Bear");
  expect(ctl(after, oppressor)).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Storyweave: two lore counters on History of Benalia, then Nyxborn Courser enters with two +1/+1 counters", async ({ page }) => {
  const s = scene({ hand: ["Storyweave", "Nyxborn Courser"], board: [...LANDS, "History of Benalia"] });
  const [saga, courser] = [one(s, "History of Benalia"), one(s, "Nyxborn Courser")];
  s.objects[saga]!.counters = { lore: 1 };
  await open(page, s);
  await card(page, "Storyweave", s).click();
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("Put two +1/+1 counters on target creature you control.");
  await modes.getByRole("button", { name: /Put two lore counters on target Saga you control/ }).click();
  await page.locator(`[data-obj="${saga}"]`).first().click();
  // Chapters II and III: a Knight, then the Saga goes.
  await resolveUntil(page, (st) => st.stack.length === 0 && st.triggerQueue.length === 0 && !st.pending && st.objects[saga]!.zone === "graveyard");
  await card(page, "Nyxborn Courser", s).click();
  const cast2 = menu(page).getByRole("button", { name: /^Cast it/ });
  if (await cast2.count()) await cast2.first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[courser]!.zone === "battlefield");
  expect(after.objects[courser]!.counters["+1/+1"]).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});
