// Lane B round B288 in the browser: Nihiloor (for each opponent, tap up to one untapped creature you control: Serra Angel
// for the first, none for the others; then its reflexive trigger takes the first opponent's Hill Giant) and Ashiok, Wicked
// Manipulator (+1: exile Hill Giant of the top two cards, Lightning Bolt into your hand; then Arguel's Blood Fast's
// "Pay 2 life" exiles two cards from the top of your library instead).
import { expect, test } from "@playwright/test";
import { controllerOf, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

/** The state once `done` holds (polled), kept: no second read after it. */
async function settled(page: Parameters<typeof state>[0], done: (s: GameState) => boolean): Promise<GameState> {
  let s: GameState | undefined;
  await expect.poll(async () => done((s = await state(page)))).toBe(true);
  return s!;
}

test("Nihiloor: tap Serra Angel for the first opponent and nothing for the others, then take their Hill Giant", async ({ page }) => {
  const s = scene({ hand: ["Nihiloor"], board: [...LANDS, "Serra Angel", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }, {}, {}]);
  const [nihiloor, angel, bears] = [one(s, "Nihiloor"), one(s, "Serra Angel"), one(s, "Grizzly Bears")];
  const giant = idsOf(s, "Hill Giant", "battlefield", 1)[0]!;
  const [first, second, third] = [s.players[1]!.name, s.players[2]!.name, s.players[3]!.name];
  await open(page, s);
  await card(page, "Nihiloor", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0 && st.pending.nihiloor === 1);
  expect([...(asked.pending as { options: string[] }).options].sort()).toEqual([nihiloor, angel, bears].sort());
  const bar = controls(page);
  await expect(bar).toContainText(`for ${first}, tap up to one untapped creature you control: when you do, gain control of target creature ${first} controls with power less than or equal to the tapped creature's power`);
  await page.locator(`[data-obj="${angel}"]`).first().click();
  await bar.getByRole("button", { name: "Tap 1" }).click();
  await settled(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.nihiloor === 2);
  await expect(bar).toContainText(`for ${second}, tap up to one untapped creature you control`);
  await bar.getByRole("button", { name: "Tap none" }).click();
  await settled(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.nihiloor === 3);
  await expect(bar).toContainText(`for ${third}, tap up to one untapped creature you control`);
  await bar.getByRole("button", { name: "Tap none" }).click();
  const aiming = await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  expect(aiming.objects[angel]!.tapped).toBe(true);
  expect(aiming.objects[bears]!.tapped).toBe(false);
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.triggerQueue.length === 0 && controllerOf(st, st.objects[giant]!) === 0);
  expect(after.objects[nihiloor]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Ashiok, Wicked Manipulator: +1 exiles Hill Giant and puts Lightning Bolt into your hand; then a life payment exiles cards", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Ashiok, Wicked Manipulator", "Arguel's Blood Fast // Temple of Aclazotz"], library: ["Hill Giant", "Lightning Bolt", "Grizzly Bears", "Serra Angel", "Opt"] });
  const ashiok = one(s, "Ashiok, Wicked Manipulator");
  s.objects[ashiok]!.counters.loyalty = 5;
  const [giant, bolt, bears, angel, opt] = [one(s, "Hill Giant"), one(s, "Lightning Bolt"), one(s, "Grizzly Bears"), one(s, "Serra Angel"), one(s, "Opt")];
  await open(page, s);
  await page.locator(`[data-obj="${ashiok}"]`).first().click();
  await menu(page).locator("button", { hasText: "Look at the top two cards" }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(asked.pending?.kind === "searchLibrary" ? [...asked.pending.cards].sort() : []).toEqual([giant, bolt].sort());
  const pick = modal(page);
  await expect(pick).toContainText("into exile");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const plus = await settled(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(plus.objects[bolt]!.zone).toBe("hand");
  expect(plus.objects[ashiok]!.counters.loyalty).toBe(6);
  // Arguel's Blood Fast: {1}{B}, Pay 2 life: draw a card. The 2 life are the Bears and the Angel from the top instead.
  await page.locator(`[data-obj="${one(s, "Arguel's Blood Fast")}"]`).first().click();
  const item = menu(page).locator("button", { hasText: "Draw a card" });
  if (await item.count()) await item.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[opt]!.zone === "hand");
  expect([after.objects[bears]!.zone, after.objects[angel]!.zone]).toEqual(["exile", "exile"]);
  expect(after.players[0]!.life).toBe(s.players[0]!.life);
  expect(pageErrors(page)).toEqual([]);
});
