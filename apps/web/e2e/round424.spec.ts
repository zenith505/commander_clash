// Round 424 in the browser: Emissary of Grudges revealing Ana as its chosen player to send her Lightning Bolt back at
// her; Dack Fayden, Helping Hand giving each of the three creatures it put onto the battlefield to a
// different opponent (the "gains control" picker); Swindler's Scheme countering your Hill Giant and offering you Ana's
// Serra Angel from the top of her library, cast without paying its mana cost.
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, controllerOf, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

test("Dack Fayden, Helping Hand: three creatures revealed, goaded, one to Cy, one to Ana, the last to Ben", async ({ page }) => {
  const s = scene({ hand: ["Dack Fayden, Helping Hand"], board: LANDS, library: ["Serra Angel", "Forest", "Grizzly Bears", "Llanowar Elves"] });
  const [angel, bears, elves] = [idsOf(s, "Serra Angel", "library", 0)[0]!, idsOf(s, "Grizzly Bears", "library", 0)[0]!, idsOf(s, "Llanowar Elves", "library", 0)[0]!];
  await open(page, s);
  await card(page, "Dack Fayden, Helping Hand", s).click();
  const first = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "giveControlTo");
  expect((first.pending as { about?: string }).about).toBe(angel);
  const c = controls(page);
  await expect(c).toContainText("choose the opponent who gains control of Serra Angel");
  await c.getByRole("button", { name: "Cy", exact: true }).click();
  const second = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "giveControlTo" && (st.pending as { about?: string }).about === bears);
  expect((second.pending as { options: string[] }).options).toEqual(["1", "2"]);
  await expect(c).toContainText("choose the opponent who gains control of Grizzly Bears");
  await c.getByRole("button", { name: "Ana", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && controllerOf(st, st.objects[elves]!) === 2);
  expect([angel, bears, elves].map((id) => controllerOf(after, after.objects[id]!))).toEqual([3, 1, 2]);
  for (const id of [angel, bears, elves]) expect(characteristics(after, after.objects[id]!).goadedBy).toEqual([0]);
  expect(pageErrors(page)).toEqual([]);
});

test("Swindler's Scheme: Ana reveals Serra Angel, your Hill Giant is countered, and you cast her Serra Angel for free", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant"], board: LANDS }, [{ board: ["Swindler's Scheme"], library: ["Serra Angel"] }]);
  const giant = one(s, "Hill Giant");
  const angel = idsOf(s, "Serra Angel", "library", 1)[0]!;
  await open(page, s);
  await card(page, "Hill Giant", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  expect((asked.pending as { objectId: string }).objectId).toBe(angel);
  expect(asked.objects[giant]!.zone).toBe("graveyard");
  const c = controls(page);
  await expect(c).toContainText("cast Serra Angel without paying its mana cost?");
  await c.getByRole("button", { name: "Cast it", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[angel]!.zone === "battlefield");
  expect(controllerOf(after, after.objects[angel]!)).toBe(0);
  expect(after.objects[angel]!.owner).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Emissary of Grudges (Ana chosen): her Lightning Bolt at you gets a new target, Ana herself", async ({ page }) => {
  let s: GameState = scene({ board: [...LANDS, "Emissary of Grudges"] }, [{ hand: ["Lightning Bolt"], board: ["Mountain"] }]);
  const em = one(s, "Emissary of Grudges");
  s.objects[em]!.chosen = { player: 1 };
  const bolt = idsOf(s, "Lightning Bolt", "hand", 1)[0]!;
  const [life, anaLife] = [s.players[0]!.life, s.players[1]!.life];
  // You pass; Ana casts Lightning Bolt at you, and everyone passes back to you.
  s = applyAction(s, { type: "passPriority", player: 0 });
  for (const a of planCast(s, 1, bolt, [{ kind: "player", id: 0 }])!) s = applyAction(s, a);
  while (waitingOn(s) !== 0) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  await open(page, s);
  await page.locator(`[data-obj="${em}"]`).first().click();
  const item = menu(page).locator("button", { hasText: "Choose new targets" });
  if (await item.count()) await item.first().click();
  const top = s.stack.find((x) => x.kind === "spell")!.id;
  await page.locator(`[data-stack="${top}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "newTargets");
  await expect(page.locator(".targeting")).toContainText("new targets for Lightning Bolt");
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect(after.players[0]!.life).toBe(life);
  expect(after.players[1]!.life).toBe(anaLife - 3);
  expect(pageErrors(page)).toEqual([]);
});
