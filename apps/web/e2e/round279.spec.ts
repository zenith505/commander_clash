// Round 279 in the browser: Thunderwave's "you may choose a creature" (spared from the 3 damage), Yusri's number of
// coins to flip, Sin Prodder's question to an opponent (put the revealed card into its owner's graveyard and be dealt
// its mana value) and Requiem Monolith's "that creature's controller may have ~ deal 1 damage to it".
import { expect, test } from "@playwright/test";
import { applyAction, nextRandom, planActivate, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** The next d20 rolled comes up `value` (the game's seeded random numbers, CR 706.1b). */
function rig(s: GameState, value: number) {
  for (let st = 1; ; st++) {
    if (1 + Math.floor(nextRandom({ rngState: st }) * 20) === value) {
      s.rngState = st;
      return;
    }
  }
}

test("Thunderwave rolls 14: spare your Grizzly Bears; Ana's Hill Giant is dealt 3 and dies", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Grizzly Bears"], hand: ["Thunderwave"] }, [{ board: ["Hill Giant"] }]);
  const [wave, bears, giant] = [one(s0, "Thunderwave"), one(s0, "Grizzly Bears"), one(s0, "Hill Giant")];
  rig(s0, 14);
  const s = passToPrompt(run(s0, planCast(s0, 0, wave)));
  expect(s.pending).toMatchObject({ kind: "pickPermanents", player: 0, min: 0, count: 1 });
  await open(page, s);
  await expect(controls(page)).toContainText("click up to one creature to spare, then choose it (Thunderwave deals 3 damage to each creature not chosen)");
  await page.locator(`[data-obj="${bears}"]`).click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[giant]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[bears]!.damage ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Yusri attacks: choose 3 with + and Choose; a card for each flip won, 2 damage for each flip lost", async ({ page }) => {
  const s0 = scene({ board: ["Yusri, Fortune's Flame"] }, [], { step: "beginCombat" });
  const yusri = one(s0, "Yusri, Fortune's Flame");
  s0.players[0]!.hand = [];
  let s = s0;
  for (let i = 0; i < 20 && s.pending?.kind !== "declareAttackers"; i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  s = passToPrompt(applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: yusri, defender: 1 }] }));
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: 0, what: "number" });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Yusri, Fortune's Flame: choose a number between 1 and 5");
  await bar.getByRole("button", { name: "Number plus one" }).click();
  await bar.getByRole("button", { name: "Number plus one" }).click();
  await bar.getByRole("button", { name: "Choose 3" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.log.some((l) => /flips 3 coins for Yusri/.test(l.text)));
  const won = after.players[0]!.hand.length;
  expect(won).toBeLessThanOrEqual(3);
  expect(after.players[0]!.life).toBe(40 - 2 * (3 - won));
  expect(pageErrors(page)).toEqual([]);
});

test("Sin Prodder at Ana's upkeep reveals Hill Giant: Ben and Cy decline, you put it into her graveyard and take 4", async ({ page }) => {
  const s0 = scene({}, [{ board: ["Sin Prodder"], library: ["Hill Giant"] }]);
  const giant = one(s0, "Hill Giant");
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "punisher" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Sin Prodder");
  await bar.getByRole("button", { name: "Have them put it into their graveyard" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(after.players[1]!.graveyard).toContain(giant);
  expect(after.players[0]!.life).toBe(36);
  expect(pageErrors(page)).toEqual([]);
});

test("Requiem Monolith on your Grizzly Bears: Yes, it deals 1 damage to them; you draw a card and lose 1 life", async ({ page }) => {
  const s0 = scene({ board: ["Requiem Monolith", "Grizzly Bears"] });
  const [mono, bears] = [one(s0, "Requiem Monolith"), one(s0, "Grizzly Bears")];
  const hand = s0.players[0]!.hand.length;
  const s = passToPrompt(run(s0, planActivate(s0, 0, mono, 0, [{ kind: "object", id: bears }])));
  expect(s.pending).toMatchObject({ kind: "chooseMay", player: 0 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Requiem Monolith");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.players[0]!.hand.length === hand + 1);
  expect(after.objects[bears]!.damage).toBe(1);
  expect(after.players[0]!.life).toBe(39);
  expect(pageErrors(page)).toEqual([]);
});
