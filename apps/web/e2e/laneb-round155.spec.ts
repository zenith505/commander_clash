// Lane B round B155 in the browser: Illusionary Terrain's two basic land types chosen as it enters (CR 305.7), Vision
// Charm's land type and basic land type chosen as it resolves (CR 611.2c), Write into Being's manifest pick and its
// top-or-bottom pick (CR 701.40a), and Covenant of Minds decided by you when Ana casts it at you.
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, planCast, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, modal, resolveUntil } from "./ui";

test("Illusionary Terrain: you click Island, then Swamp, and Ana's Islands become Swamps", async ({ page }) => {
  let s: GameState = scene({ hand: ["Illusionary Terrain"], board: LANDS }, [{ board: ["Island", "Command Tower"] }]);
  const terrain = one(s, "Illusionary Terrain");
  const anaIsland = idsOf(s, "Island", "battlefield", 1)[0]!;
  for (const a of planCast(s, 0, terrain)!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "basicLandType" && x.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("choose two basic land types: the first (basic lands of this type change)");
  await bar.getByRole("button", { name: /Island$/ }).click();
  const second = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "basicLandType" && !x.pending.options.includes("Island"));
  expect(second.pending?.kind === "chooseOption" && second.pending.options).toEqual(["Plains", "Swamp", "Mountain", "Forest"]);
  await expect(bar).toContainText("choose the second basic land type");
  await bar.getByRole("button", { name: /Swamp$/ }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && !!x.objects[terrain]!.chosen?.landTypes?.[1]);
  expect(after.objects[terrain]!.chosen?.landTypes).toEqual(["Island", "Swamp"]);
  // CR 305.7: the basic Island is a Swamp now (and taps for {B}); Command Tower isn't basic and keeps no land type.
  expect(characteristics(after, after.objects[anaIsland]!).subtypes).toEqual(["Swamp"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Vision Charm: you click Gate, then Mountain, as it resolves", async ({ page }) => {
  let s: GameState = scene({ hand: ["Vision Charm"], board: LANDS }, [{ board: ["Azorius Guildgate"] }]);
  const charm = one(s, "Vision Charm");
  for (const a of planCast(s, 0, charm, [], [1])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "landType" && x.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Vision Charm");
  await bar.getByRole("button", { name: "Gate", exact: true }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "basicLandType");
  await bar.getByRole("button", { name: /Mountain$/ }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[charm]!.zone === "graveyard");
  // The Gate is a Mountain until end of turn: an end-of-turn effect setting its land type.
  expect(after.effects.some((e) => e.duration === "endOfTurn" && e.mods.some((m) => m.kind === "setLandTypes" && m.subtypes.includes("Mountain")))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Write into Being: you manifest Hill Giant, then put Grizzly Bears on the bottom", async ({ page }) => {
  let s: GameState = scene({ hand: ["Write into Being"], board: LANDS, library: ["Grizzly Bears", "Hill Giant", "Forest"] });
  const [write, bears, giant] = [one(s, "Write into Being"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  for (const a of planCast(s, 0, write)!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  await open(page, s);
  const pick = modal(page);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const second = await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary" && x.objects[giant]!.zone === "battlefield");
  expect(second.objects[giant]!.faceDown).toBe("manifest");
  expect(second.pending?.kind === "searchLibrary" && second.pending.cards).toEqual([bears]);
  // Taking none puts it on the bottom.
  await expect(pick).toContainText("Write into Being: put a card back on top of your library");
  await pick.getByRole("button", { name: "Take none" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[write]!.zone === "graveyard");
  const lib = after.players[0]!.library;
  expect(lib[lib.length - 1]).toBe(bears);
  expect(pageErrors(page)).toEqual([]);
});

test("Covenant of Minds: Ana casts it at you, you click No, and she draws five", async ({ page }) => {
  let s: GameState = scene({ board: LANDS }, [{ hand: ["Covenant of Minds"], board: ["Island", "Island", "Island", "Island", "Island"], library: ["Llanowar Elves", "Grizzly Bears", "Hill Giant", "Forest"] }]);
  const [covenant, bears] = [one(s, "Covenant of Minds"), one(s, "Grizzly Bears")];
  s = playUntil(s, (x) => x.activePlayer === 1 && x.step === "main1" && x.priority === 1 && x.stack.length === 0 && !x.pending);
  const hand = s.players[1]!.hand.length;
  for (const a of planCast(s, 1, covenant, [{ kind: "player", id: 0 }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "chooseMay" && x.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Covenant of Minds");
  await bar.getByRole("button", { name: "No", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.objects[covenant]!.zone === "graveyard" && x.objects[bears]!.zone === "graveyard");
  // Covenant left her hand; the three revealed went to her graveyard and she drew five.
  expect(after.players[1]!.hand.length).toBe(hand - 1 + 5);
  expect(pageErrors(page)).toEqual([]);
});
