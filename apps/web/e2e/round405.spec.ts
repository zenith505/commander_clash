// Round 405 in the browser: Eye of Duskmantle's life payment for a card you surveilled into your graveyard this turn, Spirit
// of Resilience's and Lazav, Wearer of Faces's choice of a card to become a copy of until end of turn (or none).
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, planCast, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;

test("Eye of Duskmantle: Divination surveilled into your graveyard is cast from there for 3 life, not for its mana cost", async ({ page }) => {
  const s0 = scene({ hand: ["Consider"], board: [...LANDS, "Eye of Duskmantle"], library: ["Divination"] });
  const div = idsOf(s0, "Divination", "library", 0)[0]!;
  // Consider's surveil puts Divination into the graveyard (in the engine), then the page opens.
  let s = s0;
  for (const a of planCast(s, 0, one(s, "Consider"))!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "arrangeTop");
  s = applyAction(s, { type: "arrangeTop", player: 0, top: [], away: [div] });
  s = playUntil(s, (st) => st.stack.length === 0 && !st.pending);
  expect(s.objects[div]!.zone).toBe("graveyard");
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Divination" }).click();
  // Its mana cost can't be paid this way; the life can.
  await expect(menu(page).getByRole("button", { name: /^Cast from graveyard 2 U$/ })).toBeDisabled();
  await menu(page).getByRole("button", { name: /^Cast from graveyard: pay 3 life/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === hand + 2);
  expect(after.players[0]!.life).toBe(37);
  expect(after.objects[div]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Spirit of Resilience: casting Gravecrawler from your graveyard, the Spirit gets a counter and becomes a copy of it", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Walking Corpse", "Spirit of Resilience"], yard: ["Gravecrawler"] });
  const [crawler, spirit] = [one(s, "Gravecrawler"), one(s, "Spirit of Resilience")];
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Gravecrawler" }).click();
  await menu(page).getByRole("button", { name: /^Cast from graveyard/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "copyAmong" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("you may have Spirit of Resilience become a copy of an artifact or creature card until end of turn");
  await bar.getByRole("button", { name: "Gravecrawler" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[crawler]!.zone === "battlefield");
  expect(nameOf(after, spirit)).toBe("Spirit of Resilience");
  expect(after.objects[spirit]!.counters["+1/+1"]).toBe(1);
  expect(after.objects[spirit]!.copyEffects?.length).toBe(1);
  // Gravecrawler's 2/1 with the +1/+1 counter.
  await expect(page.locator(`[data-obj="${spirit}"]`).first()).toContainText("3/2");
  expect(pageErrors(page)).toEqual([]);
});

test("Lazav, Wearer of Faces: sacrificing the Clue, you may have Lazav become the Grizzly Bears it exiled, or stay Lazav", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Lazav, Wearer of Faces"] }, [{ yard: ["Grizzly Bears"] }]);
  const [lazav, bears] = [one(s0, "Lazav, Wearer of Faces"), one(s0, "Grizzly Bears")];
  // Lazav attacks Ana (in the engine): its trigger exiles the Bears from her graveyard and investigates.
  let s = playUntil(s0, (st) => st.pending?.kind === "declareAttackers");
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: lazav, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseTargets");
  s = applyAction(s, { type: "chooseTargets", player: 0, targets: [{ kind: "object", id: bears }] });
  s = playUntil(s, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "exile" && st.battlefield.some((id) => st.objects[id]!.isToken));
  const clue = s.battlefield.find((id) => s.objects[id]!.isToken)!;
  expect(planActivate(s, 0, clue, 0)).not.toBeNull();
  await open(page, s);
  await page.locator(`[data-obj="${clue}"]`).first().click();
  await menu(page).getByRole("button", { name: /Sacrifice/ }).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "copyAmong" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: /^Don't copy/ })).toBeVisible();
  await bar.getByRole("button", { name: "Grizzly Bears" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && !!st.objects[lazav]!.copyEffects?.length);
  expect(after.objects[lazav]!.copyEffects![0]!.until).toBe("endOfTurn");
  await expect(page.locator(`[data-obj="${lazav}"]`).first()).toContainText("Grizzly Bears");
  expect(pageErrors(page)).toEqual([]);
});
