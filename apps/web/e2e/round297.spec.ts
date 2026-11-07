// Round 297: draw replacements that exile (Eruth) and search (Archmage Ascension), each one more option in the
// drawing player's "Replace this draw" bar (CR 616.1); the search opens the library picker. Szadek's mill replacement
// against your Glacial Chasm: you, the damaged player, choose which applies (CR 616.1, Szadek's rulings).
import { expect, test } from "@playwright/test";
import { applyAction, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil, seat } from "./ui";

test("Archmage Ascension with six quest counters: a draw may be a search instead, or stay a draw", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Archmage Ascension"], library: ["Goblin Piker", "Hill Giant", "Grizzly Bears", "Craw Wurm", "Llanowar Elves"] });
  s.objects[one(s, "Archmage Ascension")]!.counters = { quest: 6 };
  const libSize = s.players[0]!.library.length;
  const wurm = s.players[0]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Craw Wurm")!;
  await open(page, s);
  await card(page, "Divination", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "drawInstead" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Replace this draw:");
  await bar.getByRole("button", { name: /Search your library for a card.*Archmage Ascension/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await pick.locator(`[data-pick="${wurm}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  // The second draw: the search again, or the plain draw.
  await resolveUntil(page, (st) => st.pending?.kind === "drawInstead" && st.pending.player === 0);
  await bar.getByRole("button", { name: "Draw the card", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const hand = after.players[0]!.hand;
  expect(hand).toHaveLength(2);
  expect(hand).toContain(wurm);
  expect(after.players[0]!.library).toHaveLength(libSize - 2);
  expect(pageErrors(page)).toEqual([]);
});

test("Eruth and an opponent's Notion Thief: you choose which replaces each draw; Eruth's cards can be played this turn", async ({ page }) => {
  const s = scene(
    { hand: ["Divination"], board: [...LANDS, "Eruth, Tormented Prophet"], library: ["Forest", "Hill Giant", "Grizzly Bears", "Craw Wurm", "Llanowar Elves"] },
    [{ board: ["Notion Thief"] }],
  );
  const anaHand = s.players[1]!.hand.length;
  await open(page, s);
  await card(page, "Divination", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "drawInstead" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: /Exile the top 2 cards of your library instead; you may play them this turn \(Eruth/ }).click();
  // The second draw: this time Notion Thief's replacement.
  const second = await resolveUntil(page, (st) => st.pending?.kind === "drawInstead" && st.pending.player === 0);
  const pend = second.pending as Extract<typeof second.pending, { kind: "drawInstead" }>;
  const thiefLabel = pend.labels![pend.options.indexOf("thief")]!;
  await bar.getByRole("button", { name: thiefLabel, exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const names = (ids: string[]) => ids.map((id) => after.cards[after.objects[id]!.cardId]!.name).sort();
  expect(names(after.players[0]!.exile)).toEqual(["Forest", "Hill Giant"]);
  expect(after.players[0]!.hand).toHaveLength(0);
  expect(after.players[1]!.hand).toHaveLength(anaHand + 1);
  // The exiled Forest can be played from exile this turn.
  const forest = after.players[0]!.exile.find((id) => after.cards[after.objects[id]!.cardId]!.name === "Forest")!;
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable", { hasText: "Basic Land — Forest" }).click();
  await menu(page).getByRole("button", { name: "Play it", exact: true }).click();
  const played = await resolveUntil(page, (st) => st.battlefield.includes(forest));
  expect(played.objects[forest]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

for (const [what, pick, milled] of [["prevent", "Prevent the damage", 0], ["mill", /mill that many cards instead/, 5]] as const) {
  test(`Szadek attacks you behind Glacial Chasm: you choose ${what}, and ${milled} cards are milled`, async ({ page }) => {
    let s: GameState = scene({ board: ["Glacial Chasm"] }, [{ board: ["Szadek, Lord of Secrets"] }]);
    const sz = one(s, "Szadek, Lord of Secrets");
    const lib = s.players[0]!.library.length;
    s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
    s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: sz, defender: 0 }] });
    s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
    await open(page, s);
    const bar = controls(page);
    await expect(bar.getByRole("button", { name: "Prevent the damage", exact: true })).toHaveCount(1);
    await bar.getByRole("button", { name: pick }).click();
    const after = await resolveUntil(page, (st) => st.step !== "combatDamage" && !st.pending);
    expect(lib - after.players[0]!.library.length).toBe(milled);
    expect(after.objects[sz]!.counters["+1/+1"] ?? 0).toBe(milled);
    expect(after.players[0]!.life).toBe(40);
    expect(pageErrors(page)).toEqual([]);
  });
}
