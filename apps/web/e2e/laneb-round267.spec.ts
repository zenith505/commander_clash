// Lane B round B267 in the browser: Taster of Wares (Ana reveals a card, you choose it to exile and may cast it later),
// Curse of Leeches (as it transforms back into its Aura face, choose the player it's attached to) and The Seventh Doctor
// (choose a card in your hand; Ana guesses about its mana value).
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics, setFace, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, clickPlayer, controls, modal, passTo, resolveUntil } from "./ui";

test("Taster of Wares: Ana reveals her Lightning Bolt; choose it, it's exiled, and you may cast it while you control the Taster", async ({ page }) => {
  const s = scene({ hand: ["Taster of Wares"], board: LANDS }, [{ hand: ["Lightning Bolt"] }]);
  const bolt = one(s, "Lightning Bolt");
  await open(page, s);
  await card(page, "Taster of Wares", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await clickPlayer(page, 1);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(asked.pending?.kind === "searchLibrary" ? asked.pending.cards : []).toEqual([bolt]);
  const pick = modal(page);
  await expect(pick).toContainText("Taster of Wares");
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "exile");
  expect(after.objects[bolt]!.mayPlay).toMatchObject({ player: 0, until: "whileControlled", anyType: true });
  expect(pageErrors(page)).toEqual([]);
});

test("Curse of Leeches: night becomes day as Ana's turn begins; attach it to Ben as Leeching Lurker transforms", async ({ page }) => {
  let s: GameState = scene({ board: ["Curse of Leeches // Leeching Lurker"] });
  const curse = one(s, "Curse of Leeches");
  // Night, with Leeching Lurker face up; you cast two spells this turn, so it becomes day at the next untap (CR 731.2).
  s.dayNight = "night";
  setFace(s, s.objects[curse]!, 1);
  (s.castThisTurn ??= []).push({ player: 0, card: "test" }, { player: 0, card: "test" });
  invalidateCharacteristics(s);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "attachPlayer");
  expect(s.dayNight).toBe("day");
  expect(s.activePlayer).toBe(1);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("choose a player to attach Curse of Leeches to as it transforms");
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  // Read from the log: the game plays on (and Ana casting nothing makes it night again as Ben's turn begins).
  const after = await resolveUntil(page, (st) => !st.pending && st.log.some((l) => l.text === "Curse of Leeches is attached to Ben."));
  expect(after.objects[curse]!.zone).toBe("battlefield");
  expect(after.log.some((l) => /Curse of Leeches is put into the graveyard/.test(l.text))).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("The Seventh Doctor: attack Ana, choose Divination; she guesses it isn't greater than your 0 artifacts, so cast it free", async ({ page }) => {
  const s = scene({ board: ["The Seventh Doctor"], hand: ["Divination", "Island"] });
  const [doctor, div] = [one(s, "The Seventh Doctor"), one(s, "Divination")];
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[doctor, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "predicamentCard" && st.pending.player === 0, 60);
  const bar = controls(page);
  await expect(bar).toContainText("choose a card in your hand: Ana guesses whether its mana value is greater than the number of artifacts you control");
  await bar.getByRole("button", { name: "Divination" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[div]!.zone === "graveyard");
  // A spell was cast this way: no Clue.
  expect(idsOf(after, "Clue", "battlefield", 0)).toHaveLength(0);
  expect(after.log.some((x) => /Ana guesses not greater than that/.test(x.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("The Seventh Doctor: choose an Island; Ana guesses right, so you investigate", async ({ page }) => {
  const s = scene({ board: ["The Seventh Doctor"], hand: ["Divination", "Island"] });
  const [doctor, island] = [one(s, "The Seventh Doctor"), idsOf(s, "Island", "hand", 0)[0]!];
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[doctor, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "predicamentCard" && st.pending.player === 0, 60);
  await controls(page).locator("button", { hasText: "Island" }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.log.some((x) => /creates a Clue/.test(x.text)));
  expect(after.objects[island]!.zone).toBe("hand");
  expect(after.log.some((x) => /Ana guessed right/.test(x.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
