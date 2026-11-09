// Lane B round B156 in the browser: Price of Betrayal's counters picked one at a time off an opponent (rulings), Wicked
// Slumber's two "either of them" picks, Death or Glory's graveyard piles (CR 700.3) with Ana choosing the pile exiled, and
// Mercurial Transformation's Frog-or-Octopus choice as it resolves, and Light of Judgment's up-to-one Equipment pick.
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, modal, resolveUntil } from "./ui";

test("Price of Betrayal: you take two of Ana's energy counters and her experience counter, then stop", async ({ page }) => {
  let s: GameState = scene({ hand: ["Price of Betrayal"], board: LANDS });
  s.players[1]!.energy = 3;
  s.players[1]!.experience = 1;
  s.players[1]!.poison = 2;
  const spell = one(s, "Price of Betrayal");
  for (const a of planCast(s, 0, spell, [{ kind: "player", id: 1 }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "removeCounter" && x.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("choose a counter to remove from Ana (1 of 5)");
  await expect(bar.getByRole("button")).toHaveText(["A poison counter (2 left)", "A energy counter (3 left)", "A experience counter (1 left)", "None"]);
  await bar.getByRole("button", { name: "A energy counter (3 left)" }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "removeCounter" && x.pending.labels?.[1] === "A energy counter (2 left)");
  await bar.getByRole("button", { name: "A energy counter (2 left)" }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "removeCounter" && x.pending.labels?.[1] === "A energy counter (1 left)");
  await bar.getByRole("button", { name: "A experience counter (1 left)" }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "removeCounter" && !x.pending.options.includes("experience"));
  await bar.getByRole("button", { name: "That's all" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[spell]!.zone === "graveyard");
  expect([after.players[1]!.energy, after.players[1]!.experience, after.players[1]!.poison]).toEqual([1, 0, 2]);
  expect(pageErrors(page)).toEqual([]);
});

test("Wicked Slumber: both of Ana's creatures are tapped, and you put both stun counters on Hill Giant", async ({ page }) => {
  let s: GameState = scene({ hand: ["Wicked Slumber"], board: LANDS }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [spell, bears, giant] = [one(s, "Wicked Slumber"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  for (const a of planCast(s, 0, spell, [{ kind: "object", id: bears }, { kind: "object", id: giant }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "splitTargets" && x.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar.getByRole("button")).toHaveText(["Put a stun counter on Grizzly Bears", "Put a stun counter on Hill Giant"]);
  await bar.getByRole("button", { name: "Put a stun counter on Hill Giant" }).click();
  const second = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "splitTargets" && x.objects[giant]!.counters.stun === 1);
  expect(second.objects[bears]!.tapped && second.objects[giant]!.tapped).toBe(true);
  await bar.getByRole("button", { name: "Put a stun counter on Hill Giant" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[spell]!.zone === "graveyard");
  expect(after.objects[giant]!.counters.stun).toBe(2);
  expect(after.objects[bears]!.counters.stun ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Death or Glory: you choose Ana, put Hill Giant alone in the first pile, and Ana exiles a pile", async ({ page }) => {
  let s: GameState = scene({ hand: ["Death or Glory"], board: LANDS, yard: ["Grizzly Bears", "Hill Giant", "Llanowar Elves", "Forest"] });
  const [spell, bears, giant, elves] = [one(s, "Death or Glory"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Llanowar Elves")];
  for (const a of planCast(s, 0, spell)!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "opponent" && x.pending.player === 0);
  await open(page, s);
  await controls(page).getByRole("button", { name: "Ana", exact: true }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary" && !!x.pending.piles);
  const pick = modal(page);
  await expect(pick).toContainText("Death or Glory: separate your graveyard's cards into two piles");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  // Ana exiles one pile (the bot: the one worth more to you); the other returns to the battlefield.
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[spell]!.zone === "graveyard");
  const zones = [bears, giant, elves].map((id) => after.objects[id]!.zone);
  expect([["battlefield", "exile", "battlefield"], ["exile", "battlefield", "exile"]]).toContainEqual(zones);
  expect(pageErrors(page)).toEqual([]);
});

test("Mercurial Transformation: you click the Octopus, and your Llanowar Elves is a 4/4 blue Octopus with no abilities", async ({ page }) => {
  let s: GameState = scene({ hand: ["Mercurial Transformation"], board: [...LANDS, "Llanowar Elves"] });
  const [spell, elves] = [one(s, "Mercurial Transformation"), one(s, "Llanowar Elves")];
  for (const a of planCast(s, 0, spell, [{ kind: "object", id: elves }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "either" && x.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar.getByRole("button")).toHaveText(["It becomes a blue Frog creature with base power and toughness 1/1", "It becomes a blue Octopus creature with base power and toughness 4/4"]);
  await bar.getByRole("button", { name: /Octopus/ }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[spell]!.zone === "graveyard");
  const c = characteristics(after, after.objects[elves]!);
  expect([c.power, c.toughness, c.subtypes, c.colors]).toEqual([4, 4, ["Octopus"], ["U"]]);
  expect(pageErrors(page)).toEqual([]);
});

test("Light of Judgment: 6 damage to Ana's Hill Giant, then you destroy Bonesplitter attached to it; Short Sword isn't offered", async ({ page }) => {
  let s: GameState = scene({ hand: ["Light of Judgment"], board: LANDS }, [{ board: ["Hill Giant", "Bonesplitter", "Short Sword"] }]);
  const [spell, giant, splitter, sword] = [one(s, "Light of Judgment"), one(s, "Hill Giant"), one(s, "Bonesplitter"), one(s, "Short Sword")];
  s.objects[splitter]!.attachedTo = giant;
  for (const a of planCast(s, 0, spell, [{ kind: "object", id: giant }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "pickPermanents" && x.pending.player === 0);
  await open(page, s);
  await expect(controls(page)).toContainText("click up to one Equipment attached to that creature. Light of Judgment destroys it.");
  await expect(page.locator(`.targetable[data-obj="${sword}"]`)).toHaveCount(0);
  // Attached under the giant: its visible corner.
  await page.locator(`[data-obj="${splitter}"]`).first().click({ position: { x: 6, y: 6 } });
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[spell]!.zone === "graveyard");
  expect([after.objects[splitter]!.zone, after.objects[sword]!.zone, after.objects[giant]!.zone]).toEqual(["graveyard", "battlefield", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});
