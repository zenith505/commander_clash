// Lane B round B269 in the browser: Prowl, Stoic Strategist (its attack trigger exiles your tapped Grizzly Bears; casting
// it from exile draws you a card and converts Prowl), Lucy MacLean, Positively Armed (Ana gets a copy of your Soldier
// token and you draw) and Apple of Eden, Isu Relic (Ana's hand exiled face down; you cast her Grizzly Bears from her exile
// pile and she draws a card).
import { expect, test } from "@playwright/test";
import { characteristics, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { attack, card, clickPlayer, controls, menu, modal, passTo, resolveUntil, seat } from "./ui";

const tokens = (s: GameState, pid: number) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid);

test("Prowl, Stoic Strategist: it attacks with Grizzly Bears and exiles the tapped Bears; cast them from exile, draw, and Prowl converts", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Prowl, Stoic Strategist // Prowl, Pursuit Vehicle", "Grizzly Bears"] });
  const [prowl, bears] = [one(s, "Prowl, Stoic Strategist"), one(s, "Grizzly Bears")];
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[prowl, 1], [bears, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0, 60);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const exiled = await resolveUntil(page, (st) => st.step === "main2" && st.activePlayer === 0 && st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "exile", 60);
  expect(exiled.objects[bears]!.mayPlay).toMatchObject({ player: 0, until: "exiled" });
  const hand = exiled.players[0]!.hand.length;
  const exile = seat(page, 0).locator(".zone", { hasText: "Exile" });
  await expect(exile.locator(".zone-title")).toHaveText("Exile ✦");
  await exile.click();
  await modal(page).locator(".card.playable").click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.players[0]!.hand.length).toBe(hand + 1);
  expect(characteristics(after, after.objects[prowl]!).name).toBe("Prowl, Pursuit Vehicle");
  expect(pageErrors(page)).toEqual([]);
});

test("Lucy MacLean, Positively Armed: cast Raise the Alarm; target Ana, click Yes: she gets a copy of a Soldier and you draw", async ({ page }) => {
  const s = scene({ hand: ["Raise the Alarm"], board: [...LANDS, "Lucy MacLean, Positively Armed"] });
  await open(page, s);
  await card(page, "Raise the Alarm", s).click();
  // Two Soldiers entered at once: two triggers, each targeting a player other than you.
  for (let i = 0; i < 2; i++) {
    await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0 && st.triggerQueue.length === 2 - i);
    await clickPlayer(page, 1);
  }
  const may = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const hand = may.players[0]!.hand.length;
  const bar = controls(page);
  await expect(bar).toContainText("copy of it");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && tokens(st, 1).length === 1);
  expect(tokens(after, 0)).toHaveLength(2);
  expect(after.players[0]!.hand.length).toBe(hand + 1);
  expect(after.log.some((l) => /Ana creates a token that's a copy of Soldier Token/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Apple of Eden, Isu Relic: Ana's hand is exiled face down; cast her Grizzly Bears from her exile pile and she draws a card", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Apple of Eden, Isu Relic"] }, [{ hand: ["Grizzly Bears", "Hill Giant"] }]);
  const [apple, bears, giant] = [one(s, "Apple of Eden, Isu Relic"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await page.locator(`[data-obj="${apple}"]`).first().click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /Look at target opponent's hand/ }).click();
  await expect(page.getByText(/choose target opponent/)).toBeVisible();
  await clickPlayer(page, 1);
  const exiled = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "exile");
  expect(exiled.players[0]!.life).toBe(36);
  expect(exiled.objects[giant]!.hiddenExile).toMatchObject({ seen: [0], label: "Face down" });
  expect(exiled.players[1]!.hand).toHaveLength(0);
  const theirs = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await expect(theirs.locator(".zone-title")).toHaveText("Exile ✦");
  await theirs.click();
  await modal(page).locator(".card.playable", { hasText: "Grizzly Bears" }).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  // Its owner drew a card (the delayed trigger, CR 603.7); Hill Giant is still exiled until the end step.
  expect(after.players[1]!.hand).toHaveLength(1);
  expect(after.objects[giant]!.zone).toBe("exile");
  expect(idsOf(after, "Apple of Eden, Isu Relic", "graveyard", 0)).toEqual([apple]);
  expect(pageErrors(page)).toEqual([]);
});
