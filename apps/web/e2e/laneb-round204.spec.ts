// Lane B round B204 in the browser: Journey to the Lost City's land pick after a low roll, Lavabrink Floodgates' doom
// counter question at your upkeep, Choice of Damnations (your "lose that much life?" and, as its target, your number),
// Infernal Offering's two opponent choices and graveyard pick, Hew the Entwood's land sacrifice and pick, and Druid of the
// Emerald Grove's "which one onto the battlefield tapped" after a 10—19.
import { expect, test } from "@playwright/test";
import { applyAction, nextRandom, planCast, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

/** The next d20 rolled comes up `value` (the game's seeded random numbers, CR 706.1b). */
function rig(s: GameState, value: number) {
  for (let st = 1; ; st++) {
    if (1 + Math.floor(nextRandom({ rngState: st }) * 20) === value) {
      s.rngState = st;
      return;
    }
  }
}

test("Journey to the Lost City: at your upkeep a 5 lets you put the Forest exiled with it onto the battlefield", async ({ page }) => {
  let s = scene({ board: ["Journey to the Lost City"], library: ["Hill Giant", "Forest", "Sol Ring", "Lightning Bolt"] });
  const [giant, forest] = s.players[0]!.library.slice(0, 2) as [string, string];
  // Round the table to your next upkeep, its trigger waiting on the stack.
  s = playUntil(s, (st) => st.activePlayer === 0 && st.step === "upkeep" && st.stack.length > 0);
  rig(s, 5);
  await open(page, s);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  // Only the land card can be chosen; the four exiled are shown.
  expect(asked.pending?.kind === "searchLibrary" && asked.pending.cards).toEqual([forest]);
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveCount(1);
  await pick.locator(`[data-pick="${forest}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[forest]!.zone === "battlefield");
  expect(after.objects[giant]!.zone).toBe("exile");
  expect(after.log.some((e) => e.text.includes("rolls a d20 for Journey to the Lost City: 5"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Lavabrink Floodgates: at your upkeep put the third doom counter on it; it's sacrificed and deals 6 damage to each creature", async ({ page }) => {
  let s = scene({ board: ["Lavabrink Floodgates", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const [gates, bears, giant] = [one(s, "Lavabrink Floodgates"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  // Round the table to your next upkeep (the bots answer at theirs), its trigger waiting on the stack; two doom counters
  // on it by then.
  s = playUntil(s, (st) => st.activePlayer === 0 && st.step === "upkeep" && st.stack.length > 0);
  s.objects[gates]!.counters.doom = 2;
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "addOrRemoveCounter" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Lavabrink Floodgates has 2 doom counters");
  await expect(bar.getByRole("button", { name: "Remove a doom counter from it" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Neither" })).toBeVisible();
  await bar.getByRole("button", { name: "Put another doom counter on it" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[giant]!.zone === "graveyard");
  expect(after.objects[gates]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Choice of Damnations: Ana chooses a number, and you have her lose that much life", async ({ page }) => {
  const s = scene({ hand: ["Choice of Damnations"], board: LANDS }, [{ board: ["Grizzly Bears", "Hill Giant", "Sol Ring"] }]);
  const spell = one(s, "Choice of Damnations");
  await open(page, s);
  await card(page, "Choice of Damnations", s).click();
  await clickPlayer(page, 1);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const n = asked.resolving!.chosen!.number!;
  const bar = controls(page);
  await expect(bar).toContainText(`Have that player lose ${n} life (if you don't, they sacrifice all but ${n} permanents)`);
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[spell]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(40 - n);
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 1).length).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Choice of Damnations: Ana targets you and you choose 3 on the number prompt", async ({ page }) => {
  let s = scene({ board: ["Grizzly Bears", "Hill Giant", "Sol Ring", "Forest"] }, [{ hand: ["Choice of Damnations"], board: LANDS }]);
  s = playUntil(s, (st) => st.activePlayer === 1 && st.step === "main1" && !st.pending && st.priority === 1);
  for (const a of planCast(s, 1, one(s, "Choice of Damnations"), [{ kind: "player", id: 0 }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "number");
  const life = s.players[0]!.life;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("choose a number: Choice of Damnations' caster then has you lose that much life or sacrifice all but that many permanents");
  for (let i = 0; i < 3; i++) await bar.getByRole("button", { name: "Number plus one" }).click();
  await bar.getByRole("button", { name: "Choose 3" }).click();
  // Ana decides; you keep three of your four permanents if she has you sacrifice: then it's your pick.
  const after = await resolveUntil(page, (st) => (st.pending?.kind === "pickPermanents" && st.pending.player === 0) || (!st.pending && st.stack.length === 0 && st.players[0]!.life < life));
  expect(after.log.some((e) => /You chooses 3|You choose 3|chooses 3/.test(e.text))).toBe(true);
  if (after.pending?.kind === "pickPermanents") {
    await page.locator(`[data-obj="${one(s, "Hill Giant")}"]`).click();
    await page.locator(`[data-obj="${one(s, "Grizzly Bears")}"]`).click();
    await page.locator(`[data-obj="${one(s, "Sol Ring")}"]`).click();
    await bar.getByRole("button", { name: /^Keep/ }).click();
    const done = await resolveUntil(page, (st) => !st.pending && st.objects[one(s, "Forest")]!.zone === "graveyard");
    expect(done.objects[one(s, "Hill Giant")]!.zone).toBe("battlefield");
  } else expect(after.players[0]!.life).toBe(life - 3);
  expect(pageErrors(page)).toEqual([]);
});

test("Infernal Offering: choose Ana to sacrifice with you, then Ben; return Hill Giant, then Ben returns his", async ({ page }) => {
  const s = scene({ hand: ["Infernal Offering"], board: [...LANDS, "Grizzly Bears"], yard: ["Hill Giant"] }, [{ board: ["Grizzly Bears"] }, { yard: ["Hill Giant"] }]);
  const [mine, anas] = [idsOf(s, "Grizzly Bears", "battlefield", 0)[0]!, idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!];
  const [myGiant, bensGiant] = [idsOf(s, "Hill Giant", "graveyard", 0)[0]!, idsOf(s, "Hill Giant", "graveyard", 2)[0]!];
  const hand = s.players[1]!.hand.length;
  await open(page, s);
  await card(page, "Infernal Offering", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent");
  const bar = controls(page);
  await bar.getByRole("button", { name: "Ana", exact: true }).click();
  const second = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent" && st.objects[anas]!.zone === "graveyard");
  expect(second.objects[mine]!.zone).toBe("graveyard");
  expect(second.players[1]!.hand.length).toBe(hand + 2);
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await pick.locator(`[data-pick="${myGiant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bensGiant]!.zone === "battlefield");
  expect(after.objects[myGiant]!.zone).toBe("battlefield");
  expect(after.objects[myGiant]!.controller).toBe(0);
  expect(after.objects[bensGiant]!.controller).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Hew the Entwood: sacrifice two lands, reveal two, Sol Ring enters and the Island enters tapped", async ({ page }) => {
  const s = scene({ hand: ["Hew the Entwood"], board: LANDS, library: ["Sol Ring", "Island", "Hill Giant"] });
  const [ring, island, giant] = s.players[0]!.library.slice(0, 3) as [string, string, string];
  // Differently named lands: two of one name stack, and the lower one can't be clicked.
  const plains = [idsOf(s, "Plains", "battlefield", 0)[0]!, idsOf(s, "Swamp", "battlefield", 0)[0]!];
  await open(page, s);
  await card(page, "Hew the Entwood", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Hew the Entwood: click any number of lands of yours to sacrifice.");
  for (const id of plains) await page.locator(`[data-obj="${id}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  // The top two are revealed; Hill Giant, third, isn't.
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${ring}"]`).click();
  await pick.locator(`[data-pick="${island}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[ring]!.zone === "battlefield");
  for (const id of plains) expect(after.objects[id]!.zone).toBe("graveyard");
  expect(after.objects[ring]!.tapped).toBeFalsy();
  expect(after.objects[island]!.zone).toBe("battlefield");
  expect(after.objects[island]!.tapped).toBe(true);
  expect(after.objects[ring]!.timestamp!).toBeLessThan(after.objects[island]!.timestamp!);
  expect(after.objects[giant]!.zone).toBe("library");
  expect(pageErrors(page)).toEqual([]);
});

test("Druid of the Emerald Grove: find an Island and a Forest, roll a 12, put the Island onto the battlefield tapped", async ({ page }) => {
  const s = scene({ hand: ["Druid of the Emerald Grove"], board: LANDS, library: ["Island", "Forest"] });
  const [island, forest] = s.players[0]!.library.slice(0, 2) as [string, string];
  rig(s, 12);
  await open(page, s);
  await card(page, "Druid of the Emerald Grove", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await pick.locator(`[data-pick="${island}"]`).click();
  await pick.locator(`[data-pick="${forest}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "impulseChoice" && st.pending.player === 0);
  // Still in the library, revealed, as the die is rolled.
  expect(asked.objects[island]!.zone).toBe("library");
  const bar = controls(page);
  await expect(bar).toContainText("choose the card to put onto the battlefield tapped (the other goes into your hand)");
  await bar.getByRole("button", { name: "Island", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[island]!.zone === "battlefield");
  expect(after.objects[island]!.tapped).toBe(true);
  expect(after.objects[forest]!.zone).toBe("hand");
  expect(after.log.some((e) => e.text.includes("rolls a d20 for Druid of the Emerald Grove: 12"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
