// Lane B round B210 in the browser: Kaboom!'s order for the revealed cards on the bottom of your library, Thought Lash's
// cumulative upkeep (paid by exiling the top card of your library, or not), Mystic Barrier's left or right, and the
// redirect ability Martyrdom gives your creature.
import { expect, test } from "@playwright/test";
import { applyAction, attackProblem, botActions, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

/** In the engine: bots answer their prompts and everyone passes, until `done`. */
function botsUntil(s: GameState, done: (s: GameState) => boolean): GameState {
  for (let i = 0; i < 300 && !done(s); i++) {
    const pid = waitingOn(s)!;
    s = applyAction(s, pid === 0 && !s.pending ? { type: "passPriority", player: 0 } : botActions(s, pid)[0]!);
  }
  expect(done(s)).toBe(true);
  return s;
}

test("Kaboom!: Ana is dealt Hill Giant's 4, and you order the Forest and Hill Giant on the bottom of your library", async ({ page }) => {
  let s = scene({ hand: ["Kaboom!"], board: LANDS, library: ["Forest", "Hill Giant"] });
  const giant = s.players[0]!.library[1]!;
  const forest = s.players[0]!.library[0]!;
  const life = s.players[1]!.life;
  for (const a of planCast(s, 0, one(s, "Kaboom!"), [{ kind: "player", id: 1 }])!) s = applyAction(s, a);
  s = botsUntil(s, (x) => x.pending?.kind === "arrangeTop" && x.pending.how === "bottom" && x.pending.player === 0);
  expect(s.players[1]!.life).toBe(life - 4);
  await open(page, s);
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("Hill Giant");
  // Listed top first as revealed: Forest, then Hill Giant; move Hill Giant up so it goes nearer the top of that pair.
  await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${giant}"]`) }).getByRole("button", { name: "Move toward the top" }).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[one(s, "Kaboom!")]!.zone === "graveyard");
  expect(after.players[0]!.library.slice(-2)).toEqual([giant, forest]);
  expect(after.players[1]!.life).toBe(life - 4);
  expect(pageErrors(page)).toEqual([]);
});

test("Thought Lash: you keep it by exiling the top card of your library", async ({ page }) => {
  let s = scene({ board: ["Thought Lash"] });
  const lash = one(s, "Thought Lash");
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const top = s.players[0]!.library[0]!;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Exile the top card of your library to keep Thought Lash");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[top]!.zone === "exile");
  expect(after.objects[lash]!.zone).toBe("battlefield");
  expect(after.objects[lash]!.counters.age).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Thought Lash: you don't pay, it's sacrificed, and you exile your whole library", async ({ page }) => {
  let s = scene({ board: ["Thought Lash"] });
  const lash = one(s, "Thought Lash");
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  await controls(page).getByRole("button", { name: "No" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.players[0]!.library.length === 0);
  expect(after.objects[lash]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Mystic Barrier: as it enters you choose left, and only Ana (to your left) can be attacked", async ({ page }) => {
  const s = scene({ hand: ["Mystic Barrier"], board: [...LANDS, "Grizzly Bears"] });
  const [barrier, bears] = [one(s, "Mystic Barrier"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Mystic Barrier", s).click();
  const cast = menu(page).locator("button", { hasText: /^Cast/ });
  if (await cast.count()) await cast.first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "direction" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose left or right");
  await bar.getByRole("button", { name: "Left", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[barrier]!.chosen?.direction === "left");
  expect(after.objects[barrier]!.zone).toBe("battlefield");
  expect(attackProblem(after, after.objects[bears]!, 1)).toBeNull();
  expect(attackProblem(after, after.objects[bears]!, 2)).toMatch(/nearest opponent/);
  expect(attackProblem(after, after.objects[bears]!, 3)).toMatch(/nearest opponent/);
  expect(pageErrors(page)).toEqual([]);
});

test("Martyrdom: your Grizzly Bears takes the next 1 damage of your own Shock instead of you", async ({ page }) => {
  const s = scene({ hand: ["Martyrdom", "Shock"], board: [...LANDS, "Grizzly Bears"] });
  const bears = one(s, "Grizzly Bears");
  const life = s.players[0]!.life;
  await open(page, s);
  await card(page, "Martyrdom", s).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Martyrdom")]!.zone === "graveyard");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await menu(page).locator("button", { hasText: "The next 1 damage that would be dealt to target creature, planeswalker, or player" }).click();
  await clickPlayer(page, 0);
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.players[0]!.redirectNext?.length ?? 0) > 0);
  await card(page, "Shock", s).click();
  await clickPlayer(page, 0);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Shock")]!.zone === "graveyard");
  expect(after.players[0]!.life).toBe(life - 1);
  expect(after.objects[bears]!.damage).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
