// Round 305's prompts: Tegwyll's Scouring cast in another player's turn by tapping three flyers (the optional cost,
// then which creatures), Canoptek Wraith's search for basic lands that share one name, Enchanter's Bane's "unless that
// player sacrifices it" choice, and Razorfield Ripper's reconfigure for {E}{E}{E}.
import { expect, test } from "@playwright/test";
import { applyAction, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, playWithBots, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 60 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Tegwyll's Scouring in Ana's end step: tap Wind Drake, Storm Crow and Suntail Hawk to cast it as though it had flash", async ({ page }) => {
  const s0 = scene({ hand: ["Tegwyll's Scouring"], board: [...LANDS, "Wind Drake", "Storm Crow", "Suntail Hawk", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }], { step: "end" });
  const [drake, crow, hawk, giant] = [one(s0, "Wind Drake"), one(s0, "Storm Crow"), one(s0, "Suntail Hawk"), one(s0, "Hill Giant")];
  const s = playUntil(s0, (st) => st.activePlayer === 1 && st.step === "end" && waitingOn(st) === 0);
  await open(page, s);
  await card(page, "Tegwyll's Scouring", s).click();
  const cost = page.locator(".targeting", { hasText: "as an additional cost, you may tap three untapped creatures you control with flying" });
  await cost.getByRole("button", { name: "Tap three untapped creatures you control with flying" }).click();
  const tap = page.locator(".targeting", { hasText: "flying" });
  for (const id of [drake, crow, hawk]) await page.locator(`[data-obj="${id}"]`).click();
  await tap.getByRole("button", { name: "Tap and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect([drake, crow, hawk].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard"]);
  expect(after.battlefield.filter((id) => after.objects[id]!.isToken && after.objects[id]!.controller === 0)).toHaveLength(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Canoptek Wraith: pay {3} and sacrifice it, then two Islands (a Forest no longer fits)", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Canoptek Wraith"] });
  const wraith = one(s0, "Canoptek Wraith");
  const s = playWithBots(s0, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0, [[wraith, 1]]);
  await open(page, s);
  await expect(controls(page)).toContainText("and sacrifice it?");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  expect(asked.pending).toMatchObject({ player: 0, max: 2, oneName: true });
  expect(asked.objects[wraith]!.zone).toBe("graveyard");
  const lib = asked.players[0]!.library;
  const nameOf = (id: string) => asked.cards[asked.objects[id]!.cardId]!.name;
  const island = lib.find((id) => nameOf(id) === "Island")!;
  const forest = lib.find((id) => nameOf(id) === "Forest")!;
  const pick = modal(page);
  await pick.locator(`[data-pick="${island}"]`).click();
  await expect(pick.locator(`[data-pick="${forest}"]`)).toHaveClass(/\bdim\b/);
  await expect(pick.locator(`[data-pick="${forest}"]`)).toHaveAttribute("title", "It doesn't have the same name as the cards you chose");
  await pick.locator(`[data-pick="${island}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const before = s.battlefield.filter((id) => nameOf(id) === "Island").length;
  const after = await resolveUntil(page, (st) => !st.pending && st.battlefield.filter((id) => st.cards[st.objects[id]!.cardId]!.name === "Island").length === before + 2);
  const fresh = after.battlefield.filter((id) => after.cards[after.objects[id]!.cardId]!.name === "Island" && !s.battlefield.includes(id));
  expect(fresh.every((id) => after.objects[id]!.tapped)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Enchanter's Bane targeting itself in your end step: sacrifice it, or take 2 damage", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Enchanter's Bane"] });
  const bane = one(s0, "Enchanter's Bane");
  let s = playUntil(s0, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  s = passToPrompt(applyAction(s, { type: "chooseTargets", player: 0, targets: [{ kind: "object", id: bane }] }));
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: 0, what: "punisher" });
  const life = s.players[0]!.life;
  await open(page, s);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Sacrifice the enchantment" })).toBeVisible();
  await bar.getByRole("button", { name: "Take damage from the enchantment equal to its mana value" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.players[0]!.life === life - 2);
  expect(after.objects[bane]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Razorfield Ripper: reconfigure for {E}{E}{E} onto Grizzly Bears", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Razorfield Ripper", "Grizzly Bears"] });
  const [ripper, bears] = [one(s, "Razorfield Ripper"), one(s, "Grizzly Bears")];
  s.players[0]!.energy = 3;
  await open(page, s);
  await page.locator(`[data-obj="${ripper}"]`).click();
  const entry = menu(page).getByRole("button", { name: /^Reconfigure ⚡ ⚡ ⚡ : attach/ });
  await expect(menu(page).getByRole("button", { name: /^Reconfigure 2 : attach/ })).toBeVisible();
  await entry.click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[ripper]!.attachedTo === bears);
  expect(after.players[0]!.energy).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
