// Round 257's prompts: Rip, Spawn Hunter's pick of creature and/or Vehicle cards with different powers, Master of
// Predicaments (choose a card in your hand; an opponent's guess, and yours), Memories Returning's alternating picks,
// Guided Passage (an opponent picks a creature, a land and a noncreature, nonland card from your library) and Wildfire
// Devils (the chosen player exiles an instant or sorcery card from their graveyard for the Devils' controller to copy).
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, controls, modal, passTo, resolveUntil } from "./ui";

test("Rip, Spawn Hunter: tapped at your second main phase, take Grizzly Bears and Hill Giant; Gray Ogre has the Bears' power", async ({ page }) => {
  const s = scene({ board: ["Rip, Spawn Hunter"], library: ["Grizzly Bears", "Hill Giant", "Gray Ogre", "Forest", "Llanowar Elves"] });
  const [rip, bears, giant, ogre, elves] = ["Rip, Spawn Hunter", "Grizzly Bears", "Hill Giant", "Gray Ogre", "Llanowar Elves"].map((n) => one(s, n)) as [string, string, string, string, string];
  s.objects[rip]!.tapped = true;
  await open(page, s);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0, 200);
  expect(asked.step).toBe("main2");
  const pick = modal(page);
  await expect(pick).toContainText("Each must have a different power.");
  await pick.locator(`[data-pick="${bears}"]`).click();
  // The Ogre's power is the Bears': it can't join them.
  await expect(pick.locator(`[data-pick="${ogre}"]`)).toHaveClass(/dim/);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "hand");
  expect([after.objects[giant]!.zone, after.objects[ogre]!.zone, after.objects[elves]!.zone]).toEqual(["hand", "library", "library"]);
  // The fifth card wasn't revealed (Rip's power is 4): it's on top now.
  expect(after.players[0]!.library[0]).toBe(elves);
  expect(pageErrors(page)).toEqual([]);
});

test("Master of Predicaments: hit Ana, choose Colossal Dreadmaw in your hand; she guesses 4 or less, so you cast it for nothing", async ({ page }) => {
  const s = scene({ board: ["Master of Predicaments"], hand: ["Colossal Dreadmaw", "Lightning Bolt"] });
  const [master, dreadmaw] = [one(s, "Master of Predicaments"), one(s, "Colossal Dreadmaw")];
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[master, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "predicamentCard" && st.pending.player === 0, 60);
  const bar = controls(page);
  await expect(bar).toContainText("choose a card in your hand: Ana guesses whether its mana value is greater than 4");
  await bar.getByRole("button", { name: "Colossal Dreadmaw" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[dreadmaw]!.zone === "battlefield");
  expect(after.log.some((x) => /Ana guesses 4 or less/.test(x.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Master of Predicaments: Ana's Sphinx hits you; you guess greater than 4 about the card she chose", async ({ page }) => {
  let s: GameState = scene({}, [{ board: ["Master of Predicaments"], hand: ["Colossal Dreadmaw"] }]);
  const [master, dreadmaw] = [one(s, "Master of Predicaments"), one(s, "Colossal Dreadmaw")];
  s = playUntil(s, (st) => st.activePlayer === 1 && st.pending?.kind === "declareAttackers");
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: master, defender: 0 }] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "predicamentGuess" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Ana chose a card in their hand. Guess whether its mana value is greater than 4");
  await bar.getByRole("button", { name: "Greater than 4" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.log.some((x) => /guessed right/.test(x.text)));
  expect(after.objects[dreadmaw]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Memories Returning: you take Hill Giant, choose Ana, she bottoms one, you take another, she bottoms one, the last is yours", async ({ page }) => {
  const s = scene({ hand: ["Memories Returning"], board: LANDS, library: ["Lightning Bolt", "Hill Giant", "Grizzly Bears", "Gray Ogre", "Counterspell"] });
  const names = ["Lightning Bolt", "Hill Giant", "Grizzly Bears", "Gray Ogre", "Counterspell"];
  const ids = names.map((n) => one(s, n));
  const hand = s.players[0]!.hand.length - 1;
  await open(page, s);
  await card(page, "Memories Returning", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "alternatePick" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("put one of the revealed cards into your hand");
  await bar.getByRole("button", { name: "Hill Giant" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent");
  await bar.getByRole("button", { name: "Ana" }).click();
  // Ana (a bot) bottoms one; then it's yours again.
  const again = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "alternatePick" && st.pending.player === 0);
  const left = again.pending?.kind === "chooseOption" ? again.pending.options : [];
  expect(left.length).toBe(3);
  const take = left[0]!;
  await bar.getByRole("button", { name: again.cards[again.objects[take]!.cardId]!.name }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[take]!.zone === "hand");
  expect(ids.filter((id) => after.objects[id]!.zone === "hand").length).toBe(3);
  expect(after.players[0]!.hand.length).toBe(hand + 3);
  expect(after.players[0]!.library.slice(-2).every((id) => ids.includes(id))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Guided Passage: Ana casts it and chooses you; you pick a creature, a land and a noncreature, nonland card from her library", async ({ page }) => {
  let s: GameState = scene({}, [{ hand: ["Guided Passage"], board: LANDS, library: ["Divination", "Grizzly Bears", "Hill Giant", "Lightning Bolt", "Counterspell"] }]);
  // Ana draws Divination on her turn.
  s = playUntil(s, (st) => st.activePlayer === 1 && st.step === "main1" && !st.pending && st.stack.length === 0);
  const passage = one(s, "Guided Passage");
  for (const a of planCast(s, 1, passage)!) s = applyAction(s, a);
  for (let i = 0; i < 20 && !s.pending; i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "opponent", player: 1 });
  s = applyAction(s, { type: "chooseOption", player: 1, choice: "0" });
  expect(s.pending).toMatchObject({ kind: "searchLibrary", player: 0, forPlayer: 1 });
  const [bears, giant, bolt, counter] = ["Grizzly Bears", "Hill Giant", "Lightning Bolt", "Counterspell"].map((n) => one(s, n)) as [string, string, string, string];
  const land = s.players[1]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Land"))!;
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("The cards Ana revealed");
  await pick.locator(`[data-pick="${bears}"]`).click();
  // One creature only.
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveClass(/dim/);
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await expect(pick.locator(`[data-pick="${counter}"]`)).toHaveClass(/dim/);
  await pick.locator(`[data-pick="${land}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "library" && st.objects[bears]!.zone !== "library" && st.objects[bolt]!.zone !== "library");
  // Ana (a bot) may go on to play the land or cast what she got: none of the three is left in her library.
  expect([bears, bolt, land].map((id) => after.objects[id]!.zone === "library")).toEqual([false, false, false]);
  expect(after.log.some((x) => /Grizzly Bears/.test(x.text) && /hand/.test(x.text))).toBe(true);
  expect(after.objects[bears]!.owner).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Wildfire Devils: chosen at random, you exile Lightning Bolt from your graveyard, then cast its copy at Ana", async ({ page }) => {
  // A seed where the random choice is you.
  let s: GameState | undefined;
  for (let seed = 1; seed < 60 && !s; seed++) {
    let t: GameState = scene({ hand: ["Wildfire Devils"], board: LANDS, yard: ["Lightning Bolt", "Divination"] }, [], { seed });
    for (const a of planCast(t, 0, one(t, "Wildfire Devils"))!) t = applyAction(t, a);
    for (let i = 0; i < 40 && !(t.pending && t.pending.kind !== "chooseTargets"); i++) t = applyAction(t, { type: "passPriority", player: waitingOn(t)! });
    if (t.pending?.kind === "searchLibrary" && t.pending.player === 0) s = t;
  }
  if (!s) throw new Error("no seed chose you");
  const [bolt, div] = [one(s, "Lightning Bolt"), one(s, "Divination")];
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("Wildfire Devils: exile an instant or sorcery card from your graveyard. You copy it and may cast the copy without paying its mana cost");
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong");
  const bar = controls(page);
  await bar.getByRole("button", { name: "Lightning Bolt" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree");
  await bar.getByRole("button", { name: "Cast it" }).click();
  await page.locator(`[data-player="1"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === 37);
  expect([after.objects[bolt]!.zone, after.objects[div]!.zone]).toEqual(["exile", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});
