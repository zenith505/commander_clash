// Round 293's prompts: Order of Succession's direction and the creature you take from the next player; Call to the
// Void's two secret choices; The Caves of Androzani's "for each non-Saga permanent, choose a counter on it" (the
// permanents, then the kind); Descent into Madness's pick among your permanents and the cards in your hand.
import { expect, test } from "@playwright/test";
import { controllerOf, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Order of Succession: choose left, then a creature of Ana's to gain control of", async ({ page }) => {
  const s = scene({ hand: ["Order of Succession"], board: LANDS }, [{ board: ["Grizzly Bears", "Hill Giant"] }, { board: ["Gray Ogre"] }]);
  const [bears, giant, ogre] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Gray Ogre")];
  await open(page, s);
  await card(page, "Order of Succession", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "direction");
  const bar = controls(page);
  await expect(bar).toContainText("choose left or right: starting with you, each player chooses a creature controlled by the next player that way");
  await bar.getByRole("button", { name: "Left", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  await expect(bar).toContainText("choose a creature Ana controls: you gain control of it.");
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const ctl = (st: GameState, id: string) => controllerOf(st, st.objects[id]!);
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && ctl(st, ogre) !== 2);
  expect(ctl(after, giant)).toBe(0);
  expect(ctl(after, bears)).toBe(1);
  // Ana chose Ben's only creature.
  expect(ctl(after, ogre)).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Call to the Void: secretly choose a creature you control, then one you don't; every chosen creature is destroyed", async ({ page }) => {
  const s = scene({ hand: ["Call to the Void"], board: [...LANDS, "Grizzly Bears", "Hill Giant"] }, [{ board: ["Gray Ogre"] }, { board: ["Craw Wurm"] }]);
  const [bears, giant, ogre, wurm] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Gray Ogre"), one(s, "Craw Wurm")];
  await open(page, s);
  await card(page, "Call to the Void", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  const bar = controls(page);
  await expect(bar).toContainText("secretly choose a creature you control.");
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0 && st.pending.secret === "theirs");
  await expect(bar).toContainText("secretly choose a creature you don't control.");
  await page.locator(`[data-obj="${ogre}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "graveyard");
  expect(after.log.some((l) => /The choices are revealed: You chose Grizzly Bears and Gray Ogre/.test(l.text))).toBe(true);
  expect(after.objects[ogre]!.zone).toBe("graveyard");
  // The others each chose the biggest creature they don't control: Ana and Cy the Craw Wurm, Ben the Hill Giant; Ben's
  // own choice was his only creature.
  expect(after.objects[wurm]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("The Caves of Androzani II: choose the permanents that get another counter, then the kind on one with two", async ({ page }) => {
  let s = scene({ board: [...LANDS, "The Caves of Androzani", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const [caves, bears, giant] = [one(s, "The Caves of Androzani"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[caves]!.counters = { lore: 1 };
  s.objects[bears]!.counters = { "+1/+1": 1, stun: 1 };
  s.objects[giant]!.counters = { "-1/-1": 1 };
  s = playUntil(s, (st) => st.activePlayer === 0 && st.pending?.kind === "pickPermanents");
  const at: GameState = s;
  expect(at.pending).toMatchObject({ kind: "pickPermanents", player: 0, anyNumber: true });
  await open(page, at);
  const bar = controls(page);
  await expect(bar).toContainText("choose any number of non-Saga permanents: each gets another counter of a kind already on it");
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "counterKind");
  await expect(bar).toContainText("choose a counter on Grizzly Bears");
  await bar.getByRole("button", { name: "A +1/+1 counter", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.triggerQueue.length === 0 && (st.objects[bears]!.counters["+1/+1"] ?? 0) === 2);
  expect(after.objects[bears]!.counters.stun).toBe(1);
  expect(after.objects[giant]!.counters["-1/-1"]).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Descent into Madness: exile a permanent you control or a card from your hand for each despair counter", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Descent into Madness", "Grizzly Bears"], hand: ["Opt"] });
  const [descent, bears, opt] = [one(s, "Descent into Madness"), one(s, "Grizzly Bears"), one(s, "Opt")];
  s = playUntil(s, (st) => st.activePlayer === 0 && st.turn > 1 && st.pending?.kind === "searchLibrary");
  const at: GameState = s;
  expect(at.objects[descent]!.counters.despair).toBe(1);
  expect(at.pending).toMatchObject({ kind: "searchLibrary", player: 0, min: 1, max: 1 });
  await open(page, at);
  const pick = modal(page);
  await expect(pick).toContainText("1 permanent you control and/or card from your hand to exile");
  await expect(pick.locator(`[data-pick="${bears}"]`)).toBeVisible();
  await pick.locator(`[data-pick="${opt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[opt]!.zone === "exile");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
