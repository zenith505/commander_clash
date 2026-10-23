// Round 128's prompts: Lathiel, the Bounteous Dawn ("distribute up to that many" counters), Windshaper Planetar (each
// attacking creature, "keep" or another player), Stinging Study (which commander), Orzhov Advokist (each player may
// put counters on a creature), Goblin Recruiter (a search of any number, then their order on top), Jace, the Mind
// Sculptor (the top card of another player's library).
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const plusOnes = (s: GameState, id: string) => s.objects[id]!.counters["+1/+1"] ?? 0;

test("Lathiel, the Bounteous Dawn: 3 life gained, two of the counters on Grizzly Bears and Llanowar Elves", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Lathiel, the Bounteous Dawn", "Grizzly Bears", "Llanowar Elves"] });
  const [bears, elves] = [one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  (s.turnLog ??= {}).lifeGained = { 0: 3 };
  s = playUntil(s, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await open(page, s);
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${elves}"]`).click(); // the only two other creatures: the targets are done
  const panel = page.locator(".targeting", { hasText: "distribute up to 3 +1/+1 counters" });
  await expect(panel).toBeVisible();
  const bearsRow = panel.locator(".divide", { hasText: "Grizzly Bears" });
  await expect(bearsRow.locator("strong")).toHaveText("2");
  await bearsRow.getByRole("button", { name: "+" }).click();
  await expect(panel.getByRole("button", { name: "Done" })).toHaveCount(0); // four is too many
  await bearsRow.getByRole("button", { name: "−" }).click();
  await bearsRow.getByRole("button", { name: "−" }).click();
  await panel.getByRole("button", { name: "Done" }).click(); // two of the three is fine
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && plusOnes(st, bears) > 0);
  expect([plusOnes(after, bears), plusOnes(after, elves)]).toEqual([1, 1]);
  expect(pageErrors(page)).toEqual([]);
});

test("Windshaper Planetar: flashed in as Ana attacks you with two creatures; one now attacks Ben, the other is kept", async ({ page }) => {
  const s0 = scene({ hand: ["Windshaper Planetar"], board: [...LANDS] }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [bears, giant] = [idsOf(s0, "Grizzly Bears", "battlefield", 1)[0]!, idsOf(s0, "Hill Giant", "battlefield", 1)[0]!];
  let s = playUntil(s0, (st) => st.pending?.kind === "declareAttackers" && st.activePlayer === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: bears, defender: 0 }, { attacker: giant, defender: 0 }] });
  s = playUntil(s, (st) => !st.pending && waitingOn(st) === 0);
  s = passToPrompt(run(s, planCast(s, 0, one(s, "Windshaper Planetar"))));
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "reselectAttack", player: 0 });
  const first = s.pending?.kind === "chooseOption" ? s.pending.about! : "";
  const second = first === bears ? giant : bears;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText(`choose what ${first === bears ? "Grizzly Bears" : "Hill Giant"} attacks now`);
  await expect(bar.getByRole("button", { name: "Ana", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  await expect(bar).toContainText(`choose what ${second === bears ? "Grizzly Bears" : "Hill Giant"} attacks now`);
  await bar.getByRole("button", { name: "Keep attacking You" }).click();
  await expect.poll(async () => (await state(page)).objects[first]!.attacking).toBe(2);
  expect((await state(page)).objects[second]!.attacking).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Stinging Study with two commanders: choose Hill Giant (mana value 4), draw 4 and lose 4 life", async ({ page }) => {
  const s = scene({ hand: ["Stinging Study"], board: [...LANDS, "Hill Giant"] });
  const giant = one(s, "Hill Giant");
  s.objects[giant]!.isCommander = true;
  const [hand, life] = [s.players[0]!.hand.length, s.players[0]!.life];
  await open(page, s);
  await page.locator(`[data-obj="${one(s, "Stinging Study")}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose which commander's mana value counts");
  await bar.getByRole("button", { name: "Hill Giant (mana value 4)" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.life < life);
  expect(after.players[0]!.life).toBe(life - 4);
  expect(after.players[0]!.hand.length).toBe(hand - 1 + 4);
  expect(pageErrors(page)).toEqual([]);
});

test("Orzhov Advokist: at your upkeep, two +1/+1 counters on Grizzly Bears; Ana takes them too and can't attack you", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Orzhov Advokist", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const [bears, giant] = [one(s0, "Grizzly Bears"), idsOf(s0, "Hill Giant", "battlefield", 1)[0]!];
  const s = playUntil(s0, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("click a creature of yours to put 2 +1/+1 counters on, or put none.");
  await expect(bar.getByRole("button", { name: "Put none" })).toBeVisible();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Put counters" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && plusOnes(st, bears) > 0);
  expect(plusOnes(after, bears)).toBe(2);
  expect(plusOnes(after, giant)).toBe(2);
  expect(after.players[0]!.attackBansUntil).toEqual([1]);
  expect(pageErrors(page)).toEqual([]);
});

test("Goblin Recruiter: find Raging Goblin and Goblin Piker, then they go on top in the order shown", async ({ page }) => {
  const s = scene({ hand: ["Goblin Recruiter"], board: [...LANDS], library: ["Raging Goblin", "Hill Giant", "Goblin Piker"] });
  const [raging, guide] = [one(s, "Raging Goblin"), one(s, "Goblin Piker")];
  await open(page, s);
  await card(page, "Goblin Recruiter", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  await expect(modal(page)).toContainText("Goblin");
  await expect(modal(page).locator(`[data-pick="${one(s, "Hill Giant")}"]`)).toHaveCount(0);
  await modal(page).locator(`[data-pick="${raging}"]`).click();
  await modal(page).locator(`[data-pick="${guide}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "orderLibrary");
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("Goblin Recruiter");
  const start = st.pending?.kind === "orderLibrary" ? st.pending.cards : [];
  expect(new Set(start)).toEqual(new Set([raging, guide]));
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[one(s, "Goblin Recruiter")]!.zone === "battlefield");
  expect(after.players[0]!.library.slice(0, 2)).toEqual(start);
  expect(pageErrors(page)).toEqual([]);
});

test("Jace, the Mind Sculptor +2: the top card of Ana's library goes to the bottom", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Jace, the Mind Sculptor"] });
  const jace = one(s0, "Jace, the Mind Sculptor");
  s0.objects[jace]!.counters.loyalty = 3;
  const top = s0.players[1]!.library[0]!;
  const s = passToPrompt(run(s0, planActivate(s0, 0, jace, 0, [{ kind: "player", id: 1 }])));
  expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "scry", owner: 1 });
  await open(page, s);
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("the top card of Ana's library: leave it on top or put it on the bottom");
  await arrange.locator(`[data-arrange="${top}"]`).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  await expect.poll(async () => (await state(page)).players[1]!.library.at(-1)).toBe(top);
  expect(pageErrors(page)).toEqual([]);
});
