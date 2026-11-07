// Round 296's prompts: Tablet of the Guilds' two colors, Spry and Mighty's two creatures, Aven Courier's counter kind,
// Dragon's Approach's "you may exile this spell and four cards named Dragon's Approach".
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, objHasKeyword } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, playWithBots, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Tablet of the Guilds: choose White, then a second color (White isn't offered again), Blue", async ({ page }) => {
  const s = scene({ hand: ["Tablet of the Guilds"], board: LANDS });
  const tablet = one(s, "Tablet of the Guilds");
  await open(page, s);
  await card(page, "Tablet of the Guilds", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "color" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose two colors: the first");
  await bar.getByRole("button", { name: "White" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "color" && st.pending.player === 0 && !st.pending.options.includes("White"));
  await expect(bar).toContainText("choose a second color");
  await expect(bar.getByRole("button", { name: "White" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Blue" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[tablet]!.zone === "battlefield");
  expect(after.objects[tablet]!.chosen?.colors).toEqual(["W", "U"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Spry and Mighty: click Grizzly Bears and Craw Wurm, then Choose; draw 4, both get +4/+4 and trample", async ({ page }) => {
  const s = scene({ hand: ["Spry and Mighty"], board: [...LANDS, "Grizzly Bears", "Craw Wurm", "Hill Giant"] });
  const [bears, wurm, giant] = [one(s, "Grizzly Bears"), one(s, "Craw Wurm"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Spry and Mighty", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  expect(asked.pending).toMatchObject({ kind: "pickPermanents", count: 2 });
  const hand = asked.players[0]!.hand.length;
  await expect(controls(page)).toContainText("choose exactly two creatures you control");
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${wurm}"]`).click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "battlefield" && characteristics(st, st.objects[bears]!).power === 6);
  expect(after.players[0]!.hand.length).toBe(hand + 4);
  expect(characteristics(after, after.objects[wurm]!).power).toBe(10);
  expect(objHasKeyword(after, after.objects[bears]!, "Trample")).toBe(true);
  expect(characteristics(after, after.objects[giant]!).power).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Aven Courier attacks: target Hill Giant, then choose a flying counter (from Grizzly Bears) for it", async ({ page }) => {
  const s0 = scene({ board: ["Aven Courier", "Grizzly Bears", "Hill Giant"] });
  const [courier, bears, giant] = [one(s0, "Aven Courier"), one(s0, "Grizzly Bears"), one(s0, "Hill Giant")];
  s0.objects[bears]!.counters = { "+1/+1": 1, flying: 1 };
  let s = playWithBots(s0, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0, [[courier, 1]]);
  s = applyAction(s, { type: "chooseTargets", player: 0, targets: [{ kind: "object", id: giant }] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "counterKind" && st.pending.player === 0);
  expect([...(s.pending as { options: string[] }).options].sort()).toEqual(["+1/+1", "flying"]);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("choose a counter on a permanent you control");
  await bar.getByRole("button", { name: "A flying counter", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && (st.objects[giant]!.counters.flying ?? 0) > 0);
  expect(after.objects[giant]!.counters).toEqual({ flying: 1 });
  expect(objHasKeyword(after, after.objects[giant]!, "Flying")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Dragon's Approach: Yes, pick four Dragon's Approach in the graveyard, then Shivan Dragon from the library", async ({ page }) => {
  const s = scene({ hand: ["Dragon's Approach"], board: LANDS, yard: ["Dragon's Approach", "Dragon's Approach", "Dragon's Approach", "Dragon's Approach", "Dragon's Approach"], library: ["Shivan Dragon"] });
  const spell = idsOf(s, "Dragon's Approach", "hand", 0)[0]!;
  const yard = idsOf(s, "Dragon's Approach", "graveyard", 0);
  const dragon = one(s, "Shivan Dragon");
  expect(yard.length).toBe(5);
  await open(page, s);
  await page.locator(`[data-obj="${spell}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await expect(controls(page)).toContainText("Exile Dragon's Approach and four cards named Dragon's Approach from your graveyard?");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const choosing = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect([...(choosing.pending as { cards: string[] }).cards].sort()).toEqual([...yard].sort());
  const pick = modal(page);
  await expect(pick).toContainText("exile 4 cards named Dragon's Approach from your graveyard");
  // The five alike are one stack (×5): each click on it takes one more.
  for (let i = 0; i < 4; i++) {
    await pick.locator(".modal-cards .card.targetable[data-pick]").filter({ hasText: "Dragon's Approach" }).click();
    await expect(pick).toContainText(`Found ${i + 1} of 4`);
  }
  await pick.getByRole("button", { name: "Done", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0 && st.pending.cards.includes(dragon));
  await modal(page).locator(`[data-pick="${dragon}"]`).click();
  await modal(page).getByRole("button", { name: "Done", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[dragon]!.zone === "battlefield");
  expect(after.objects[spell]!.zone).toBe("exile");
  expect(yard.filter((id) => after.objects[id]!.zone === "exile").length).toBe(4);
  expect(yard.filter((id) => after.objects[id]!.zone === "graveyard").length).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Agent's Toolkit: cast it, then Grizzly Bears; Yes, and move its deathtouch counter onto the Bears", async ({ page }) => {
  const s = scene({ hand: ["Agent's Toolkit", "Grizzly Bears"], board: LANDS });
  const [kit, bears] = [one(s, "Agent's Toolkit"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Agent's Toolkit", s).click();
  const entered = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[kit]!.zone === "battlefield");
  expect(entered.objects[kit]!.counters).toEqual({ "+1/+1": 1, flying: 1, deathtouch: 1, shield: 1 });
  await card(page, "Grizzly Bears", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await expect(controls(page)).toContainText("Move a counter from Agent's Toolkit onto that creature?");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "counterKind" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: /deathtouch/ }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && (st.objects[bears]!.counters.deathtouch ?? 0) > 0);
  expect(after.objects[kit]!.counters).toEqual({ "+1/+1": 1, flying: 1, deathtouch: 0, shield: 1 });
  expect(objHasKeyword(after, after.objects[bears]!, "Deathtouch")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
