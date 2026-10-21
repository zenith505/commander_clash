// Teamwork's tap pick and "choose both", Akroma's Will's two modes with a commander, the conspire pick, the gift
// picker, tribute's two prompts, hideaway's pick, face-down card and later play, and cipher's encode prompt.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playWithBots, scene, state } from "./scene";
import { attack, card, clickPlayer, controls, menu, modal, resolveUntil, seat } from "./ui";

const named = (s: Awaited<ReturnType<typeof state>>, pid: number, name: string) =>
  s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name.replace(/ Token$/, "") === name);

test("Beast Mode: the teamwork bar taps a creature as you cast it, and the spell adds its counter", async ({ page }) => {
  const s = scene({ hand: ["Beast Mode"], board: [...LANDS, "Grizzly Bears", "Llanowar Elves"] });
  const [bears, elves] = [one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Beast Mode", s).click();
  const bar = page.locator(".teamwork-pick");
  await expect(bar).toContainText("Teamwork 1:");
  await expect(bar.getByRole("button", { name: "Tap and cast" })).toBeDisabled();
  await expect(bar.getByRole("button", { name: "Cast without" })).toBeVisible();
  await page.locator(`[data-obj="${elves}"]`).click();
  await expect(bar).toContainText("(now 1)");
  await bar.getByRole("button", { name: "Tap and cast" }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[elves]!.tapped).toBe(true);
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(1);
  await expect(page.locator(`[data-obj="${bears}"]`)).toContainText("5/5");
  expect(pageErrors(page)).toEqual([]);
});

test("Go Nuts!: cast using teamwork, both modes without a mode menu; cast without it, the menu asks for one", async ({ page }) => {
  const s = scene({ hand: ["Go Nuts!"], board: [...LANDS, "Hill Giant"] }, [{ board: ["Grizzly Bears"] }]);
  const [giant, bears] = [one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Go Nuts!", s).click();
  const bar = page.locator(".teamwork-pick");
  await bar.getByRole("button", { name: "Cast without" }).click();
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("choose one");
  await modes.getByRole("button", { name: "Cancel" }).click();
  await card(page, "Go Nuts!", s).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Tap and cast" }).click();
  await expect(modes).toHaveCount(0);
  await page.locator(`[data-obj="${giant}"]`).click(); // the +1/+1 counter
  await page.locator(`[data-obj="${giant}"]`).click(); // your creature that fights
  await page.locator(`[data-obj="${bears}"]`).click(); // theirs
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!.counters["+1/+1"]).toBe(1);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.damage).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Akroma's Will: with your commander on the battlefield the mode menu takes both modes", async ({ page }) => {
  const s = scene({ hand: ["Akroma's Will"], board: [...LANDS, "Grizzly Bears"] });
  const bears = one(s, "Grizzly Bears");
  s.objects[bears]!.isCommander = true;
  await open(page, s);
  await card(page, "Akroma's Will", s).click();
  const modes = page.locator(".mode-menu");
  await modes.getByRole("button", { name: /double strike/ }).click();
  await modes.getByRole("button", { name: /indestructible/ }).click();
  await modes.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const kw = after.effects.flatMap((e) => e.mods.flatMap((m) => (m.kind === "addKeywords" ? m.keywords : [])));
  expect(kw).toEqual(expect.arrayContaining(["Double strike", "Indestructible"]));
  expect(pageErrors(page)).toEqual([]);
});

test("Burn Trail: the conspire bar taps two red creatures, and the copy can take a new target", async ({ page }) => {
  const s = scene({ hand: ["Burn Trail"], board: [...LANDS, "Raging Goblin", "Goblin Piker", "Grizzly Bears"] });
  const [raging, piker, bears] = [one(s, "Raging Goblin"), one(s, "Goblin Piker"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Burn Trail", s).click();
  await clickPlayer(page, 1);
  const bar = page.locator(".targeting", { hasText: "conspire" });
  await expect(bar).toBeVisible();
  await page.locator(`[data-obj="${bears}"]`).click(); // green: doesn't share a color
  await page.locator(`[data-obj="${raging}"]`).click();
  await expect(bar.getByRole("button", { name: "Tap and cast" })).toBeDisabled();
  await page.locator(`[data-obj="${piker}"]`).click();
  await bar.getByRole("button", { name: "Tap and cast" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets");
  await clickPlayer(page, 2);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[1]!.life).toBe(37);
  expect(after.players[2]!.life).toBe(37);
  expect(after.objects[raging]!.tapped && after.objects[piker]!.tapped).toBe(true);
  expect(after.objects[bears]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Blooming Blast: the gift bar promises an opponent a Treasure, and the spell also hits its controller", async ({ page }) => {
  const s = scene({ hand: ["Blooming Blast"], board: LANDS }, [{ board: ["Hill Giant"] }]);
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Blooming Blast", s).click();
  const bar = page.locator(".gift-pick");
  await expect(bar).toContainText("promise an opponent a gift (a Treasure)");
  await expect(bar.getByRole("button", { name: "No gift" })).toBeVisible();
  await bar.getByRole("button", { name: "Gift Ana" }).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(named(after, 1, "Treasure")).toHaveLength(1);
  expect(after.objects[giant]!.damage).toBe(2);
  expect(after.players[1]!.life).toBe(37);
  expect(pageErrors(page)).toEqual([]);
});

test("Fanatic of Xenagos: you choose who decides on tribute; when a bot's tribute is yours, you answer", async ({ page }) => {
  const s = scene({ hand: ["Fanatic of Xenagos"], board: LANDS, life: 60 }, [{ hand: ["Fanatic of Xenagos"], board: ["Mountain", "Forest", "Forest"] }]);
  const [mine, theirs] = [one(s, "Fanatic of Xenagos"), s.players[1]!.hand[0]!];
  await open(page, s);
  await card(page, "Fanatic of Xenagos", s).click();
  let now = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  await expect(controls(page)).toContainText("tribute 1: choose an opponent");
  await controls(page).getByRole("button", { name: "Ben" }).click();
  // Ben (a bot) decides.
  now = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[mine]!.zone === "battlefield");
  expect(now.objects[mine]!.tribute?.to).toBe(2);
  // Ana casts hers on her turn and chooses you, with the most life (her turn played in the engine, for speed).
  await open(page, playWithBots(now, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "tributePay" && st.pending.player === 0));
  await expect(controls(page)).toContainText("pay tribute 1?");
  await controls(page).getByRole("button", { name: "Don't" }).click();
  now = await resolveUntil(page, (st) => st.log.some((l) => /doesn't pay tribute/.test(l.text)));
  expect(now.objects[theirs]!.counters["+1/+1"]).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});

test("Shelldock Isle: hideaway picks a card in a pop-up, exiled face down for you to see", async ({ page }) => {
  const s = scene({ hand: ["Shelldock Isle"], board: LANDS, library: ["Hill Giant", "Grizzly Bears", "Island", "Forest"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Shelldock Isle", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Shelldock Isle: put a card into exile face down (hideaway)");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]).toMatchObject({ zone: "exile", hiddenExile: { seen: [0] } });
  const exile = seat(page, 0).locator(".zone", { hasText: "Exile" });
  await exile.click();
  await expect(modal(page).locator(".zone-tag")).toHaveText("hideaway");
  await expect(modal(page)).toContainText("Hill Giant");
  expect(pageErrors(page)).toEqual([]);
});

test("Hideaway: another player's hidden card shows face down; your Shelldock Isle plays yours once a library is small", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Shelldock Isle"], exile: ["Hill Giant"] }, [{ board: ["Mosswort Bridge"], exile: ["Grizzly Bears"] }]);
  const [isle, giant, bridge, bears] = [one(s, "Shelldock Isle"), one(s, "Hill Giant"), one(s, "Mosswort Bridge"), one(s, "Grizzly Bears")];
  s.objects[giant]!.hiddenExile = { by: isle, seen: [0] };
  s.objects[bears]!.hiddenExile = { by: bridge, seen: [1] };
  s.linkedExile = { [`${isle}@0`]: [{ id: giant, zc: 0 }], [`${bridge}@0`]: [{ id: bears, zc: 0 }] };
  // Ana's library is down to twenty cards.
  const lib = s.players[1]!.library;
  for (const id of lib.splice(0, lib.length - 20)) {
    s.objects[id]!.zone = "exile";
    s.players[1]!.exile.unshift(id);
  }
  await open(page, s);
  const theirs = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await expect(theirs.locator(".zone-label")).toHaveText("Hideaway");
  await expect(theirs).not.toContainText("Grizzly Bears");
  await page.locator(`[data-obj="${isle}"]`).click();
  await menu(page).getByRole("button", { name: /play the exiled card/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.hiddenExile).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});

test("Last Thoughts: cipher encodes it on a creature, which casts a copy when it deals combat damage", async ({ page }) => {
  test.setTimeout(120_000);
  const s = scene({ hand: ["Last Thoughts"], board: [...LANDS, "Grizzly Bears"] });
  const [thoughts, bears] = [one(s, "Last Thoughts"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Last Thoughts", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  await expect(controls(page)).toContainText("cipher: click a creature of yours");
  await expect(controls(page).getByRole("button", { name: "Don't encode" })).toBeVisible();
  await page.locator(`[data-obj="${bears}"]`).click();
  await controls(page).getByRole("button", { name: "Encode" }).click();
  let now = await resolveUntil(page, (st) => st.objects[thoughts]!.zone === "exile" && !st.pending);
  expect(now.objects[bears]!.encoded?.[0]?.id).toBe(thoughts);
  now = await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.activePlayer === 0);
  const hand = now.players[0]!.hand.length;
  await attack(page, [[bears, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "castFree", 60);
  await expect(controls(page)).toContainText("cast Last Thoughts without paying its mana cost?");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length > hand, 60);
  expect(after.players[0]!.hand.length).toBe(hand + 1);
  expect(after.objects[thoughts]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
