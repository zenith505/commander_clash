// Lane B round B152 in the browser: Dubious Challenge cast by Ana on you (you pick one of the exiled cards or none),
// Grenzo's Rebuttal (you click an artifact, a creature and a land of the player to your left), Muse Vessel's "choose a
// card exiled with it" with two cards, and Ana's suspended Pardic Dragon asking you whether to put a time counter on it.
import { expect, test } from "@playwright/test";
import { applyAction, controllerOf, planActivate, planCast } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Dubious Challenge cast by Ana on you: you take Hill Giant, Ana gets the rest", async ({ page }) => {
  // Ana draws the Forest on her turn; the two creature cards are then her top cards.
  const s0 = scene({}, [{ hand: ["Dubious Challenge"], board: ["Forest", "Forest", "Forest", "Forest"], library: ["Forest", "Hill Giant", "Grizzly Bears"] }]);
  const [dubious, giant] = [one(s0, "Dubious Challenge"), idsOf(s0, "Hill Giant", "library", 1)[0]!];
  let s = playUntil(s0, (st) => st.activePlayer === 1 && st.step === "main1" && !st.pending && !st.stack.length);
  for (const a of planCast(s, 1, dubious, [{ kind: "player", id: 0 }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "takeExiled" && st.pending.player === 0);
  const pend = s.pending as Extract<NonNullable<typeof s.pending>, { kind: "chooseOption" }>;
  expect(pend.options).toContain(giant);
  expect(pend.options.at(-1)).toBe("none");
  const others = pend.options.filter((o) => o !== giant && o !== "none");
  await open(page, s);
  await expect(controls(page)).toContainText("Dubious Challenge: you may choose one of the exiled cards and put it onto the battlefield under your control; Ana gets the rest");
  await expect(controls(page).getByRole("button", { name: "None", exact: true })).toBeVisible();
  await controls(page).getByRole("button", { name: "Hill Giant", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "battlefield" && st.stack.length === 0);
  expect(controllerOf(after, after.objects[giant]!)).toBe(0);
  for (const id of others) expect(controllerOf(after, after.objects[id]!)).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Grenzo's Rebuttal: you click Ana's Millstone, Grizzly Bears and Island; they're destroyed with the others' picks", async ({ page }) => {
  const s = scene({ hand: ["Grenzo's Rebuttal"], board: LANDS }, [{ board: ["Ornithopter", "Millstone", "Grizzly Bears", "Forest", "Island"] }, { board: ["Llanowar Elves"] }, {}]);
  const [mill, thopter, bears, elves] = [one(s, "Millstone"), one(s, "Ornithopter"), idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!, one(s, "Llanowar Elves")];
  const [forest, island] = [idsOf(s, "Forest", "battlefield", 1)[0]!, idsOf(s, "Island", "battlefield", 1)[0]!];
  await open(page, s);
  await card(page, "Grenzo's Rebuttal", s).click();
  // The artifact: only Ana's (the player to your left) can be chosen.
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await expect(controls(page)).toContainText("Grenzo's Rebuttal: click an artifact Ana controls. Grenzo's Rebuttal destroys each permanent chosen this way.");
  await page.locator(`[data-obj="${mill}"]`).click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0 && st.pending.options.includes(bears));
  await expect(controls(page)).toContainText("click a creature Ana controls.");
  await page.locator(`[data-obj="${bears}"]`).click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0 && st.pending.options.includes(island));
  await expect(controls(page)).toContainText("click a land Ana controls.");
  await page.locator(`[data-obj="${island}"]`).click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Grenzo's Rebuttal")]!.zone === "graveyard");
  expect([mill, bears, island, elves].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard", "graveyard"]);
  expect([thopter, forest].map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Muse Vessel: two cards exiled with it, you choose Hill Giant and may play it this turn", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Muse Vessel"] }, [{ hand: ["Hill Giant", "Craw Wurm"] }]);
  const [vessel, giant, wurm] = [one(s0, "Muse Vessel"), one(s0, "Hill Giant"), one(s0, "Craw Wurm")];
  // Its first ability twice in the engine (untapped in between): Ana exiles both cards from her hand.
  let s = s0;
  for (let i = 0; i < 2; i++) {
    s.objects[vessel]!.tapped = false;
    for (const a of planActivate(s, 0, vessel, 0, [{ kind: "player", id: 1 }])!) s = applyAction(s, a);
    s = playUntil(s, (st) => !st.pending && !st.stack.length);
  }
  expect([giant, wurm].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile"]);
  await open(page, s);
  await card(page, "Muse Vessel", s).click();
  await menu(page).getByRole("button", { name: /Choose a card exiled with/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  await expect(controls(page)).toContainText("Muse Vessel: choose a card exiled with it; you may play it this turn");
  await expect(controls(page).getByRole("button", { name: "Craw Wurm", exact: true })).toBeVisible();
  await controls(page).getByRole("button", { name: "Hill Giant", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.objects[giant]!.mayPlay);
  expect(after.objects[giant]!.mayPlay).toMatchObject({ player: 0, until: "thisTurn" });
  expect(after.objects[wurm]!.mayPlay).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});

test("Pardic Dragon: Ana's is suspended; you cast Grizzly Bears and click Yes to put a time counter on it", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears"], board: LANDS }, [{ exile: ["Pardic Dragon"] }]);
  const [dragon, bears] = [one(s, "Pardic Dragon"), one(s, "Grizzly Bears")];
  s.objects[dragon]!.counters.time = 2;
  await open(page, s);
  await card(page, "Grizzly Bears", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await expect(controls(page)).toContainText("Pardic Dragon");
  await expect(controls(page)).toContainText("Put a time counter on Pardic Dragon?");
  await controls(page).getByRole("button", { name: "Yes", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[dragon]!.counters.time).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});
