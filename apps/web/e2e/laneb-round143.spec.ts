// Lane B round B143 in the browser: Ana's Oath of Druids asks you, on your upkeep, which opponent with more creatures
// than you it targets (not one without), then whether to reveal until a creature card; Retriever Phoenix in your
// graveyard asks whether to come back instead of learning; Ana's Flaming Gambit at you lets you choose a creature to take
// the damage instead.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Oath of Druids: on your upkeep you choose Ben (two creatures), not Cy (none), then reveal until your Grizzly Bears", async ({ page }) => {
  const s0 = scene({ library: ["Plains", "Island", "Grizzly Bears"] }, [{ board: ["Oath of Druids"] }, { board: ["Hill Giant", "Gray Ogre"] }, {}]);
  const bears = one(s0, "Grizzly Bears");
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  expect(s.pending).toMatchObject({ kind: "chooseTargets", player: 0, controller: 1 });
  const top = s.players[0]!.library.slice(0, 2);
  await open(page, s);
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("You choose the target for Ana's ability: Oath of Druids");
  // Cy controls no more creatures than you: clicking Cy chooses nothing.
  await clickPlayer(page, 3);
  await expect(bar).toBeVisible();
  await clickPlayer(page, 2);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await expect(controls(page)).toContainText("Reveal cards from the top of your library until you reveal a creature card");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(top.every((id) => after.objects[id]!.zone === "graveyard")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Retriever Phoenix: Igneous Inspiration's learn asks first; Yes brings the Phoenix back instead", async ({ page }) => {
  const s = scene({ hand: ["Igneous Inspiration", "Gray Ogre"], board: LANDS, yard: ["Retriever Phoenix"] }, [{ board: ["Hill Giant"] }]);
  const [phoenix, giant, ogre] = [one(s, "Retriever Phoenix"), one(s, "Hill Giant"), one(s, "Gray Ogre")];
  await open(page, s);
  await card(page, "Igneous Inspiration", s).click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await expect(controls(page)).toContainText("Return Retriever Phoenix to the battlefield instead of learning?");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[phoenix]!.zone === "battlefield");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  // No learn: the Gray Ogre stays in your hand.
  expect(after.objects[ogre]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Ana's Flaming Gambit at you: you choose your Grizzly Bears to take the 3 damage instead", async ({ page }) => {
  const s0 = scene({ board: ["Grizzly Bears", "Hill Giant"] }, [{ hand: ["Flaming Gambit"], board: ["Mountain", "Mountain", "Mountain", "Mountain"] }]);
  const [gambit, bears, giant] = [one(s0, "Flaming Gambit"), one(s0, "Grizzly Bears"), one(s0, "Hill Giant")];
  // You pass; Ana casts it with X = 3 at you.
  let s = applyAction(s0, { type: "passPriority", player: 0 });
  expect(waitingOn(s)).toBe(1);
  s = passToPrompt(run(s, planCast(s, 1, gambit, [{ kind: "player", id: 0 }], undefined, undefined, 3)));
  expect(s.pending).toMatchObject({ kind: "pickPermanents", player: 0, min: 0, count: 1 });
  await open(page, s);
  await expect(controls(page)).toContainText("Flaming Gambit: choose a creature you control for Flaming Gambit to deal its damage to instead, or none");
  await page.locator(`[data-obj="${bears}"]`).click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "graveyard");
  expect(after.players[0]!.life).toBe(40);
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
