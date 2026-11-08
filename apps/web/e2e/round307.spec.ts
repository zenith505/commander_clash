// Round 307's prompts: Aminatou, the Fateshifter's −6 direction, Shelob, Dread Weaver's cost (only creature cards
// exiled with it), Goldberry, River-Daughter's "one or more counters" (no "None" before the first), and Deathmist
// Raptor's return face up or face down.
import { expect, test } from "@playwright/test";
import { applyAction, controllerOf, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { menu, modal, resolveUntil, controls } from "./ui";

const ctl = (st: GameState, id: string) => controllerOf(st, st.objects[id]!);

test("Aminatou's −6: choose right, and each player takes the nonland permanents of the player to their right", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Aminatou, the Fateshifter", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }, { board: ["Gray Ogre"] }, { board: ["Craw Wurm"] }]);
  const [ami, bears, giant, ogre, wurm] = ["Aminatou, the Fateshifter", "Grizzly Bears", "Hill Giant", "Gray Ogre", "Craw Wurm"].map((n) => one(s, n));
  s.objects[ami!]!.counters.loyalty = 6;
  await open(page, s);
  await page.locator(`[data-obj="${ami}"]`).click();
  await menu(page).getByRole("button", { name: /Choose left or right/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "direction");
  const bar = controls(page);
  await expect(bar).toContainText("choose left or right: each player gains control of all nonland permanents controlled by the next player that way.");
  await bar.getByRole("button", { name: "Right", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && ctl(st, wurm!) === 0);
  // You take Cy's (to your right); Cy takes Ben's; Ben takes Ana's; Ana takes yours.
  expect([bears, giant, ogre].map((id) => ctl(after, id!))).toEqual([1, 2, 3]);
  expect(ctl(after, ami!)).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Shelob, Dread Weaver: the cost picker offers only the creature cards exiled with it", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Shelob, Dread Weaver"], exile: ["Grizzly Bears", "Hill Giant", "Divination"] });
  const [shelob, bears, giant, div] = ["Shelob, Dread Weaver", "Grizzly Bears", "Hill Giant", "Divination"].map((n) => one(s, n));
  s.linkedExile = { [`${shelob}@0`]: [bears!, giant!, div!].map((id) => ({ id, zc: s.objects[id]!.zoneChanges ?? 0 })) };
  await open(page, s);
  await page.locator(`[data-obj="${shelob}"]`).click();
  await menu(page).getByRole("button", { name: /Put two \+1\/\+1 counters on/ }).click();
  const pick = modal(page);
  await expect(pick).toContainText("put a creature card exiled with Shelob, Dread Weaver into its owner's graveyard");
  await expect(pick.locator(`[data-pick="${div}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[shelob!]!.counters["+1/+1"] ?? 0) === 2);
  expect(after.objects[giant!]!.zone).toBe("graveyard");
  expect(after.objects[bears!]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Goldberry's {U}, {T}: move counters one at a time onto Grizzly Bears, with no way to stop before the first", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Goldberry, River-Daughter", "Grizzly Bears"] });
  const [gold, bears] = [one(s, "Goldberry, River-Daughter"), one(s, "Grizzly Bears")];
  s.objects[gold]!.counters = { "+1/+1": 2, oil: 1 };
  await open(page, s);
  await page.locator(`[data-obj="${gold}"]`).click();
  await menu(page).getByRole("button", { name: /Move one or more counters/ }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const first = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "removeCounter");
  expect((first.pending as { options: string[] }).options).toEqual(["+1/+1", "oil"]);
  const box = modal(page).or(controls(page));
  await expect(box.getByRole("button", { name: "None" })).toHaveCount(0);
  await box.getByRole("button", { name: /A \+1\/\+1 counter/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "removeCounter" && st.pending.options.includes("done"));
  await box.getByRole("button", { name: "That's all" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && (st.objects[bears]!.counters["+1/+1"] ?? 0) === 1);
  expect(after.objects[gold]!.counters).toMatchObject({ "+1/+1": 1, oil: 1 });
  expect(after.players[0]!.hand.length).toBe(s.players[0]!.hand.length + 1);
  expect(pageErrors(page)).toEqual([]);
});

test("Deathmist Raptor: when Exalted Angel is turned face up, return the Raptor from your graveyard face down", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Exalted Angel"], yard: ["Deathmist Raptor"] });
  const [angel, raptor] = [one(s, "Exalted Angel"), one(s, "Deathmist Raptor")];
  s.objects[angel]!.faceDown = "morph";
  s.players[0]!.manaPool.W = 4;
  s = applyAction(s, { type: "turnFaceUp", player: 0, objectId: angel });
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Return Deathmist Raptor from your graveyard to the battlefield face up or face down?");
  await bar.getByRole("button", { name: "Yes", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "either");
  const box = modal(page).or(bar);
  await expect(box.getByRole("button", { name: "Face up", exact: true })).toBeVisible();
  await box.getByRole("button", { name: "Face down", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[raptor]!.zone === "battlefield");
  expect(after.objects[raptor]!.faceDown).toBeTruthy();
  expect(pageErrors(page)).toEqual([]);
});
