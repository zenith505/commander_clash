// Scion of Halaster's "the first time you would draw a card each turn, instead look at the top two cards": pick the one
// that goes to the graveyard. Airbend: cast the exiled card for {2} from your exile. Adeline: her token for an opponent
// with a planeswalker may attack the planeswalker.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, controls, menu, modal, resolveUntil, seat } from "./ui";

/** Our commander on the battlefield instead of in the command zone. */
function commanderOut(s: GameState) {
  const id = s.players[0]!.command.find((x) => s.objects[x]!.isCommander)!;
  s.players[0]!.command = s.players[0]!.command.filter((x) => x !== id);
  s.objects[id]!.zone = "battlefield";
  s.battlefield.push(id);
  invalidateCharacteristics(s);
  return s;
}

test("Scion of Halaster: at your next draw, pick which of the top two cards goes to the graveyard, then draw the other", async ({ page }) => {
  const s = commanderOut(scene({ commander: "Isamaru, Hound of Konda", board: ["Scion of Halaster"], library: ["Goblin Piker", "Hill Giant"] }));
  const [piker, giant] = [one(s, "Goblin Piker"), one(s, "Hill Giant")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "drawLook" && st.pending.player === 0, 300);
  const bar = controls(page);
  await expect(bar).toContainText("Isamaru, Hound of Konda:");
  await expect(bar).toContainText("instead of drawing");
  await bar.getByRole("button", { name: "Goblin Piker to graveyard" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.step !== "draw" && st.objects[piker]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("hand");
  expect(after.log.some((l) => /puts Goblin Piker into their graveyard and the other card back on top, then draws/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Airbending Lesson: the airbent creature is cast from your exile for {2}", async ({ page }) => {
  const s = scene({ hand: ["Airbending Lesson"], board: [...LANDS, "Hill Giant"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Airbending Lesson", s).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  let now = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[giant]!.zone === "exile");
  expect(now.objects[giant]!.mayPlay).toMatchObject({ player: 0, cost: "{2}" });
  const exile = seat(page, 0).locator(".zone", { hasText: "Exile" });
  await expect(exile.locator(".zone-title")).toHaveText("Exile ✦");
  await exile.click();
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: /^Cast it for/ }).click();
  now = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[giant]!.zone === "battlefield");
  expect(now.objects[giant]!.manaSpent).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Adeline: the Human token for an opponent with a planeswalker attacks the planeswalker you pick", async ({ page }) => {
  const s = scene({ board: ["Adeline, Resplendent Cathar"] }, [{ board: ["Jace Beleren"] }]);
  const [adeline, jace] = [one(s, "Adeline, Resplendent Cathar"), one(s, "Jace Beleren")];
  s.objects[jace]!.counters.loyalty = 3;
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await attack(page, [[adeline, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "attackWhom" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Human token for Ana");
  await bar.getByRole("button", { name: "Jace Beleren (Ana)" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.filter((id) => st.objects[id]!.isToken).length === 3);
  const tokens = after.battlefield.filter((id) => after.objects[id]!.isToken);
  expect(tokens.filter((id) => after.objects[id]!.attackingPermanent?.id === jace)).toHaveLength(1);
  expect(tokens.map((id) => after.objects[id]!.attacking).sort()).toEqual([1, 2, 3]);
  expect(pageErrors(page)).toEqual([]);
});

test("Tempting offer: a bot's Tempting Contract asks you; accepting gives you a Treasure and the bot another", async ({ page }) => {
  const s = scene({}, [{ board: ["Tempting Contract"] }]);
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0, 100);
  const bar = controls(page);
  await expect(bar).toContainText("Tempting Contract:");
  await expect(bar).toContainText("Create a Treasure token?");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.battlefield.some((id) => st.objects[id]!.controller === 0 && st.objects[id]!.isToken), 100);
  const treasures = (pid: number) => after.battlefield.filter((id) => after.objects[id]!.isToken && after.objects[id]!.controller === pid).length;
  expect(treasures(0)).toBe(1);
  expect(treasures(1)).toBeGreaterThanOrEqual(2); // one for you, and one for each bot that accepted
  expect(pageErrors(page)).toEqual([]);
});
