// Lane B round B125 in the browser: Phytohydra's "put that many +1/+1 counters on it instead" against a shield counter
// (its controller orders the two, CR 616.1), Emberwilde Djinn's {R}{R} or 2 life, Phyrexian Grimoire's pick of one of
// the top two cards of your graveyard to exile, Jandor's Ring's "discard the last card you drew this turn" (no card to
// pick) and Scrying Glass's number and color.
import { expect, test } from "@playwright/test";
import { applyAction, controllerOf, draw, planActivate, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

test("Phytohydra with a shield counter: Shock's damage becomes two +1/+1 counters, and the shield counter stays", async ({ page }) => {
  const s = scene({ hand: ["Shock"], board: [...LANDS, "Phytohydra"] });
  const hydra = one(s, "Phytohydra");
  s.objects[hydra]!.counters = { shield: 1 };
  await open(page, s);
  await card(page, "Shock", s).click();
  await page.locator(`[data-obj="${hydra}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "damageShield");
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Prevent the damage" })).toBeVisible();
  await bar.getByRole("button", { name: "Put the +1/+1 counters on it (Phytohydra)" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[hydra]!.counters["+1/+1"] ?? 0) === 2);
  expect(after.objects[hydra]!.counters.shield).toBe(1);
  expect(after.objects[hydra]!.damage ?? 0).toBe(0);
  await expect(page.locator(`[data-obj="${hydra}"]`).first()).toContainText("3/3");
  expect(pageErrors(page)).toEqual([]);
});

test("Emberwilde Djinn: at your upkeep pay 2 life to gain control of Ana's Djinn", async ({ page }) => {
  let s = scene({ board: LANDS }, [{ board: ["Emberwilde Djinn"] }]);
  const djinn = one(s, "Emberwilde Djinn");
  s = playUntil(s, (st) => st.activePlayer === 0 && st.step === "upkeep" && st.pending?.kind === "chooseOption" && st.pending.player === 0);
  const at: GameState = s;
  const life = at.players[0]!.life;
  await open(page, at);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Pay {R}{R}" })).toBeVisible();
  await bar.getByRole("button", { name: "Pay 2 life" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && controllerOf(st, st.objects[djinn]!) === 0);
  expect(after.players[0]!.life).toBe(life - 2);
  expect(pageErrors(page)).toEqual([]);
});

test("Phyrexian Grimoire: Ana targets you; you pick which of her top two graveyard cards is exiled", async ({ page }) => {
  let s = scene({ board: LANDS }, [{ board: ["Phyrexian Grimoire"], yard: ["Gray Ogre", "Grizzly Bears", "Hill Giant"] }]);
  const [grimoire, ogre, bears, giant] = ["Phyrexian Grimoire", "Gray Ogre", "Grizzly Bears", "Hill Giant"].map((n) => one(s, n)) as [string, string, string, string];
  s = applyAction(s, { type: "passPriority", player: 0 });
  expect(waitingOn(s)).toBe(1);
  s.players[1]!.manaPool = { ...s.players[1]!.manaPool, C: 4 };
  for (const a of planActivate(s, 1, grimoire, 0, [{ kind: "player", id: 0 }])!) s = applyAction(s, a);
  const at: GameState = s;
  // The top two: the last two put there.
  const top = at.players[1]!.graveyard.slice(-2);
  expect(top).toEqual([bears, giant]);
  await open(page, at);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${ogre}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(after.objects[ogre]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Jandor's Ring: the card you just drew is discarded with no card to pick, then you draw", async ({ page }) => {
  let s = scene({ hand: ["Opt", "Lightning Bolt"], board: [...LANDS, "Jandor's Ring"], library: ["Gray Ogre", "Hill Giant"] });
  const [ring, ogre, giant] = [one(s, "Jandor's Ring"), one(s, "Gray Ogre"), one(s, "Hill Giant")];
  draw(s, 0, 1);
  const at: GameState = s;
  expect(at.objects[ogre]!.zone).toBe("hand");
  await open(page, at);
  await page.locator(`[data-obj="${ring}"]`).first().click();
  const m = page.locator(".ability-menu");
  if (await m.isVisible().catch(() => false)) await m.locator("button", { hasText: /Draw a card/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "hand");
  expect(after.objects[ogre]!.zone).toBe("graveyard");
  expect(after.objects[ring]!.tapped).toBe(true);
  expect(after.players[0]!.hand.length).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Scrying Glass: choose 2 and red; Ana reveals two red cards of three, so you draw", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Scrying Glass"] }, [{ hand: ["Lightning Bolt", "Shock", "Llanowar Elves"] }]);
  const glass = one(s, "Scrying Glass");
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await page.locator(`[data-obj="${glass}"]`).first().click();
  const m = page.locator(".ability-menu");
  if (await m.isVisible().catch(() => false)) await m.locator("button", { hasText: /Choose a number/ }).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "number");
  const bar = controls(page);
  await expect(bar).toContainText("choose a number greater than 0 (up to 3, the cards in that player's hand)");
  await bar.getByRole("button", { name: "Number plus one" }).click();
  await bar.getByRole("button", { name: "Choose 2" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "color");
  await bar.locator('button[title="Red"]').click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === hand + 1);
  expect(after.log.some((l) => /Ana reveals/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
