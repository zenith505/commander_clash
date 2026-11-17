// Round 380: The Beamtown Bullies' gift of a creature card to the player whose turn it is (its two targets), Durnan of the
// Yawning Portal's pick from the top four and the cast from exile with undaunted, Judgment of Alexander's prevention with
// your commander striking back, and Volo, Itinerant Scholar's Journal: the creature type you note and the draw.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { attack, card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("The Beamtown Bullies: the game stops at Ana's beginning of combat; Ana gets your Hill Giant, goaded; it's exiled at her end step", async ({ page }) => {
  let s = scene({ board: [...LANDS, "The Beamtown Bullies"], yard: ["Hill Giant"] }, [{}]);
  const [bully, giant] = [one(s, "The Beamtown Bullies"), one(s, "Hill Giant")];
  s = playUntil(s, (st) => st.activePlayer === 1 && st.step === "upkeep" && st.priority === 0 && !st.pending);
  await open(page, s);
  // Usable only in an opponent's turn: the page passes the upkeep and stops before Ana's attackers.
  // Keep the state the poll saw (follow-up #7): in Ana's beginning of combat the bots get priority before you do (CR
  // 117.3a), so a state read after "beginCombat" alone could still have it with one of them.
  let at = await state(page);
  await expect.poll(async () => {
    at = await state(page);
    return at.step === "beginCombat" && at.priority === 0;
  }).toBe(true);
  expect(at.activePlayer).toBe(1);
  await page.locator(`[data-obj="${bully}"]`).click();
  await menu(page).locator("button", { hasText: "Target opponent whose turn it is" }).click();
  await clickPlayer(page, 1);
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.objects[giant]!.controller).toBe(1);
  expect(after.objects[bully]!.tapped).toBe(true);
  // Goaded, it attacks someone other than you; at Ana's end step it's exiled.
  const later = await resolveUntil(page, (st) => st.objects[giant]!.zone === "exile", 120);
  expect(later.log.some((l) => /^Hill Giant attacks (Ben|Cy)\.$/.test(l.text))).toBe(true);
  expect(later.turn).toBe(at.turn);
  expect(pageErrors(page)).toEqual([]);
});

test("Durnan of the Yawning Portal: attack, exile Hill Giant from the top four, then cast it for {R} with undaunted", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Durnan of the Yawning Portal"], library: ["Forest", "Hill Giant", "Island", "Swamp"] }, [{}]);
  const [durnan, giant] = [one(s, "Durnan of the Yawning Portal"), one(s, "Hill Giant")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  await attack(page, [[durnan, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: /^(Done|Take|Exile)/ }).first().click();
  // The other three go to the bottom in the order you choose.
  const ordered = await resolveUntil(page, (st) => st.pending?.kind === "arrangeTop" || st.objects[giant]!.zone === "exile");
  if (ordered.pending?.kind === "arrangeTop") await modal(page).getByRole("button", { name: /^(Done|Confirm|Put them)/ }).first().click();
  const exiled = await resolveUntil(page, (st) => st.objects[giant]!.zone === "exile" && !st.pending && st.step === "main2" && st.priority === 0 && st.activePlayer === 0 && st.stack.length === 0, 60);
  expect(exiled.objects[giant]!.mayPlay).toMatchObject({ until: "exiled", undaunted: true });
  // {3}{R} less {1} for each of three opponents: {R}.
  const lands = exiled.battlefield.filter((id) => exiled.objects[id]!.controller === 0 && !exiled.objects[id]!.tapped).length;
  await page.locator(".zone", { hasText: "Exile ✦" }).first().click();
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  const cast = await resolveUntil(page, (st) => st.objects[giant]!.zone === "battlefield" && st.stack.length === 0);
  expect(cast.battlefield.filter((id) => cast.objects[id]!.controller === 0 && !cast.objects[id]!.tapped && id !== giant).length).toBe(lands - 1);
  expect(pageErrors(page)).toEqual([]);
});

test("Judgment of Alexander: cast as Ana attacks you; the damage is prevented and your commander deals 6 to her Hill Giant", async ({ page }) => {
  let s = scene({ hand: ["Judgment of Alexander"], board: [...LANDS, "Craw Wurm"] }, [{ board: ["Hill Giant"] }]);
  const [wurm, giant] = [one(s, "Craw Wurm"), one(s, "Hill Giant")];
  // The Craw Wurm stands in for your commander creature.
  s.objects[wurm]!.isCommander = true;
  s = playUntil(s, (st) => st.activePlayer === 1 && st.pending?.kind === "declareAttackers");
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: giant, defender: 0 }] });
  s = playUntil(s, (st) => st.step === "declareAttackers" && st.priority === 0 && st.stack.length === 0 && !st.pending);
  await open(page, s);
  await card(page, "Judgment of Alexander", s).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "graveyard", 60);
  expect(after.players[0]!.life).toBe(40);
  expect(after.log.some((l) => l.text === "Craw Wurm deals 6 damage to Hill Giant.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

/** Volo cast and resolved in the engine: Volo's Journal is on the battlefield. */
const withJournal = (hand: string[]) => {
  let s = scene({ hand: ["Volo, Itinerant Scholar", ...hand], board: LANDS });
  const plan = planCast(s, 0, one(s, "Volo, Itinerant Scholar"));
  if (!plan) throw new Error("can't cast Volo");
  for (const a of plan) s = applyAction(s, a);
  s = playUntil(s, (st: GameState) => st.stack.length === 0 && st.triggerQueue.length === 0 && st.battlefield.some((id) => st.cards[st.objects[id]!.cardId]?.name === "Volo's Journal"));
  const journal = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]?.name === "Volo's Journal")!;
  return { s, journal };
};

test("Volo's Journal: cast Prodigal Pyromancer and note Wizard of its two creature types", async ({ page }) => {
  const { s, journal } = withJournal(["Prodigal Pyromancer"]);
  await open(page, s);
  await card(page, "Prodigal Pyromancer", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "noteType");
  const pick = page.locator(".modal.type-pick");
  await expect(pick).toContainText("note one of its creature types that hasn't been noted");
  // Only its two types are offered (the list of types on the battlefield shows Volo's Human too).
  expect(new Set(await pick.locator("[data-type]").evaluateAll((els) => els.map((e) => e.getAttribute("data-type"))))).toEqual(new Set(["Human", "Wizard"]));
  await pick.locator('[data-type="Wizard"]').first().click();
  const after = await resolveUntil(page, (st) => (st.notedFor?.[`${journal}@${st.objects[journal]!.zoneChanges ?? 0}`] ?? []).length === 1);
  expect(after.notedFor![`${journal}@${after.objects[journal]!.zoneChanges ?? 0}`]).toEqual(["Wizard"]);
  await expect(page.locator(`[data-obj="${journal}"]`).first()).toContainText("1 noted");
  expect(pageErrors(page)).toEqual([]);
});

test("Volo: {2}, {T}: target Volo's Journal with two types noted and draw two cards", async ({ page }) => {
  const { s, journal } = withJournal([]);
  const volo = one(s, "Volo, Itinerant Scholar");
  s.notedFor = { ...s.notedFor, [`${journal}@${s.objects[journal]!.zoneChanges ?? 0}`]: ["Giant", "Human"] };
  s.objects[volo]!.controlledSinceTurn = -1;
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await page.locator(`[data-obj="${volo}"]`).first().click();
  await menu(page).locator("button", { hasText: "Draw a card for each creature type noted" }).click();
  await page.locator(`[data-obj="${journal}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.players[0]!.hand.length === hand + 2 && st.stack.length === 0);
  expect(idsOf(after, "Volo, Itinerant Scholar", "battlefield", 0)).toEqual([volo]);
  expect(pageErrors(page)).toEqual([]);
});
