// Round 319's prompts: guessing land or nonland about Gollum's top card, Eumidian Wastewaker's "discard a card or
// sacrifice a permanent", Soulfire Eruption's "which target is next", Midnight Crusader Shuttle's creature to steal,
// Vaevictis Asmadi's target for each player, and Mogg Assassin's second target chosen by the first one's controller.
import { expect, test } from "@playwright/test";
import { applyAction, botActions, controllerOf, planActivate, planCast, waitingOn, type GameState } from "@cc/engine";
import { idsOf, LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, controls, menu, resolveUntil } from "./ui";

/** In the engine: bots answer their prompts (or `answer` does) and everyone passes, until `done`. */
function botsUntil(s: GameState, done: (s: GameState) => boolean, answer?: (s: GameState) => GameState | undefined): GameState {
  for (let i = 0; i < 300 && !done(s); i++) {
    const mine = answer?.(s);
    if (mine) {
      s = mine;
      continue;
    }
    const pid = waitingOn(s)!;
    const pend = s.pending;
    if (pend?.kind === "declareAttackers") s = applyAction(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (pend?.kind === "declareBlockers") s = applyAction(s, { type: "declareBlockers", player: pid, blocks: [] });
    else s = applyAction(s, pid === 0 && !pend ? { type: "passPriority", player: 0 } : botActions(s, pid)[0]!);
  }
  expect(done(s)).toBe(true);
  return s;
}

test("Gollum, Scheming Guide: Ana's Gollum attacks you, she has you guess, and you click a guess", async ({ page }) => {
  let s = scene({ board: LANDS }, [{ board: ["Gollum, Scheming Guide"], library: ["Hill Giant", "Forest"] }]);
  const gollum = one(s, "Gollum, Scheming Guide");
  s = botsUntil(
    s,
    (x) => x.pending?.kind === "chooseOption" && x.pending.player === 0 && x.pending.what === "either",
    (x) => {
      const p = x.pending;
      // Ana attacks you with Gollum and has you guess.
      if (p?.kind === "declareAttackers" && x.activePlayer === 1) return applyAction(x, { type: "declareAttackers", player: 1, attacks: [{ attacker: gollum, defender: 0 }] });
      if (p?.kind === "chooseOption" && p.player === 1 && p.what === "opponent") return applyAction(x, { type: "chooseOption", player: 1, choice: "0" });
      return undefined;
    },
  );
  const top = s.players[1]!.library[0]!;
  const isLand = s.cards[s.objects[top]!.cardId]!.types.includes("Land");
  const kind = /\(Ana chose (land|nonland)\)/.exec((s.pending as { prompt: string }).prompt)?.[1];
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("guess whether the top card of Ana's library is");
  // Guess that it's the chosen kind.
  await bar.getByRole("button", { name: /^Guess it's / }).click();
  const after = await resolveUntil(page, (x) => !x.stack.some((it) => it.sourceId === gollum) && x.log.some((l) => /the guess was (right|wrong)/.test(l.text)));
  const right = after.log.some((l) => /the guess was right/.test(l.text));
  expect(right).toBe((kind === "land") === isLand);
  // Right: Gollum is removed from combat. Wrong: Ana draws and Gollum can't be blocked.
  expect(!!after.objects[gollum]!.attacking || after.objects[gollum]!.attacking === 0).toBe(!right);
  expect(pageErrors(page)).toEqual([]);
});

test("Eumidian Wastewaker: you attack Ana, click Discard a card, and draw for the Forest you discarded", async ({ page }) => {
  const s = scene({ hand: ["Forest"], board: ["Eumidian Wastewaker", ...LANDS] }, [{ board: ["Grizzly Bears"] }]);
  const [w, forest] = [one(s, "Eumidian Wastewaker"), idsOf(s, "Forest", "hand", 0)[0]!];
  await open(page, s);
  await resolveUntil(page, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === 0);
  await attack(page, [[w, 1]]);
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.player === 0 && x.pending.what === "either");
  const bar = controls(page);
  await expect(bar).toContainText("discard a card or sacrifice a permanent");
  await expect(bar.getByRole("button", { name: "Sacrifice a permanent", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Discard a card", exact: true }).click();
  // Ana has no cards in hand: she sacrifices her Grizzly Bears, which isn't a land card.
  const after = await resolveUntil(page, (x) => x.objects[forest]!.zone === "graveyard" && !x.stack.length && !x.pending);
  expect(after.objects[one(s, "Grizzly Bears")]!.zone).toBe("graveyard");
  expect(after.players[0]!.hand.length).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Soulfire Eruption: Ana and her Hill Giant; you click Hill Giant to go first, and Craw Wurm's 6 kills it", async ({ page }) => {
  let s = scene({ hand: ["Soulfire Eruption"], board: LANDS, library: ["Craw Wurm", "Hill Giant"] }, [{ board: ["Hill Giant"] }]);
  const giant = idsOf(s, "Hill Giant", "battlefield", 1)[0]!;
  const [wurm, myGiant] = [idsOf(s, "Craw Wurm", "library", 0)[0]!, idsOf(s, "Hill Giant", "library", 0)[0]!];
  const life = s.players[1]!.life;
  for (const a of planCast(s, 0, one(s, "Soulfire Eruption"), [{ kind: "player", id: 1 }, { kind: "object", id: giant }])!) s = applyAction(s, a);
  s = botsUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "nextTarget" && x.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("choose which of Ana's group of targets is next");
  await expect(bar.getByRole("button", { name: "Ana", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Hill Giant", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.stack.length && !x.pending && x.objects[giant]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(life - 4);
  expect([after.objects[wurm]!.zone, after.objects[myGiant]!.zone]).toEqual(["exile", "exile"]);
  expect(after.objects[wurm]!.mayPlay).toMatchObject({ player: 0, until: "nextTurn" });
  expect(pageErrors(page)).toEqual([]);
});

test("Midnight Crusader Shuttle: Ana lets you take a creature; you click her Hill Giant, now tapped and attacking her", async ({ page }) => {
  let s = scene({ board: ["Midnight Crusader Shuttle", "Grizzly Bears", ...LANDS] }, [{ board: ["Hill Giant", "Craw Wurm"] }]);
  const [shuttle, bears, giant] = [one(s, "Midnight Crusader Shuttle"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  for (const a of planActivate(s, 0, shuttle, 0, undefined, undefined, [bears])!) s = applyAction(s, a);
  s = botsUntil(
    s,
    (x) => x.pending?.kind === "pickPermanents" && x.pending.player === 0,
    (x) => {
      const p = x.pending;
      if (p?.kind === "declareAttackers" && x.activePlayer === 0) return applyAction(x, { type: "declareAttackers", player: 0, attacks: [{ attacker: shuttle, defender: 1 }] });
      // Ana takes the second option.
      if (p?.kind === "chooseOption" && p.player === 1 && p.what === "villainous") return applyAction(x, { type: "chooseOption", player: 1, choice: "1" });
      return undefined;
    },
  );
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("click one of Ana's creatures to gain control of it until end of turn, tapped and attacking them");
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.stack.length && controllerOf(x, x.objects[giant]!) === 0);
  expect(after.objects[giant]!.tapped).toBe(true);
  expect(after.objects[giant]!.attacking).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Vaevictis Asmadi, the Dire: you click a target for each player, yours too; each sacrifices it and reveals a land", async ({ page }) => {
  const s = scene({ board: ["Vaevictis Asmadi, the Dire", "Grizzly Bears", ...LANDS] }, [{ board: ["Hill Giant"] }, { board: ["Craw Wurm"] }, { board: ["Sol Ring"] }]);
  const [v, bears, giant, wurm, ring] = ["Vaevictis Asmadi, the Dire", "Grizzly Bears", "Hill Giant", "Craw Wurm", "Sol Ring"].map((n) => one(s, n));
  await open(page, s);
  await resolveUntil(page, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === 0);
  await attack(page, [[v!, 1]]);
  await resolveUntil(page, (x) => x.pending?.kind === "chooseTargets" && x.pending.player === 0);
  await expect(page.locator(".targeting")).toContainText("target permanent that player controls");
  for (const id of [bears, giant, wurm, ring]) await page.locator(`[data-obj="${id}"]`).first().click();
  const after = await resolveUntil(page, (x) => !x.stack.length && !x.pending && x.objects[ring!]!.zone === "graveyard");
  expect([bears, giant, wurm].map((id) => after.objects[id!]!.zone)).toEqual(["graveyard", "graveyard", "graveyard"]);
  // Each revealed a basic land from the top of their library and put it onto the battlefield.
  expect(after.log.filter((l) => / reveals (Plains|Island|Swamp|Mountain|Forest) and puts it onto the battlefield\./.test(l.text)).length).toBe(4);
  expect(pageErrors(page)).toEqual([]);
});

test("Mogg Assassin: you click Ana's Hill Giant; Ana chooses the other target without your asking who; one is destroyed", async ({ page }) => {
  const s = scene({ board: ["Mogg Assassin", "Craw Wurm", ...LANDS] }, [{ board: ["Hill Giant"] }, { board: ["Grizzly Bears"] }]);
  const [mogg, wurm, giant] = [one(s, "Mogg Assassin"), one(s, "Craw Wurm"), one(s, "Hill Giant")];
  await open(page, s);
  await page.locator(`[data-obj="${mogg}"]`).first().click();
  await menu(page).getByRole("button", { name: /You choose target creature an opponent controls/ }).click();
  await expect(page.locator(".targeting")).toContainText("target creature an opponent controls");
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const after = await resolveUntil(page, (x) => !x.stack.length && !x.pending && x.log.some((l) => /flips a coin for Mogg Assassin/.test(l.text)));
  expect(after.log.some((l) => l.text === "You asks Ana to choose target creature for Mogg Assassin.")).toBe(true);
  const won = after.log.some((l) => /flips a coin for Mogg Assassin and wins the flip/.test(l.text));
  if (won) expect(after.objects[giant]!.zone).toBe("graveyard");
  else expect([mogg, wurm, one(s, "Grizzly Bears")].filter((id) => after.objects[id]!.zone === "graveyard").length).toBe(1);
  expect(after.objects[mogg]!.tapped || after.objects[mogg]!.zone === "graveyard").toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
