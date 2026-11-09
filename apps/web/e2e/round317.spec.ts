// Round 317 in the browser: Zenos yae Galvus's "choose a creature an opponent controls" (only opponents' creatures
// offered) and, once that creature leaves, Shinryu's "choose an opponent" as it transforms; The Legend of Yangchen's
// chapter I, where you choose first among your opponents' permanents; Summon: Esper Valigarmanda's chapter II, casting a
// card exiled with it for its cost with red mana for a blue spell; Triple Triad's free plays from exile at your upkeep;
// and Tasha, the Witch Queen's −3 among cards in exile with page counters, whoever owns them.
import { expect, test } from "@playwright/test";
import type { GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil, seat } from "./ui";

// Quoted in full for e2e/cards.json; a scene names a double-faced card by its front face.
const ZENOS = "Zenos yae Galvus // Shinryu, Transcendent Rival";
const YANGCHEN = "The Legend of Yangchen // Avatar Yangchen";

test("Zenos: choose Ana's Hill Giant (yours isn't offered); the rest get -2/-2; Bolt the Giant and choose Ana as it transforms", async ({ page }) => {
  const s = scene({ hand: [ZENOS, "Lightning Bolt"], board: [...LANDS, "Craw Wurm"] }, [{ board: ["Hill Giant", "Grizzly Bears"] }]);
  const [zenos, giant, bears, wurm] = [one(s, "Zenos yae Galvus"), one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Craw Wurm")];
  await open(page, s);
  await card(page, "Zenos yae Galvus", s).click();
  const pick = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  expect(pick.pending).toMatchObject({ action: "choose", options: expect.arrayContaining([giant, bears]) });
  expect((pick.pending as { options: string[] }).options).not.toContain(wurm);
  await expect(controls(page)).toContainText("choose a creature an opponent controls");
  await page.locator(`[data-obj="${giant}"]`).click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  const shrunk = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "graveyard");
  expect(shrunk.objects[zenos]!.chosen?.object?.id).toBe(giant);
  expect(shrunk.objects[giant]!.zone).toBe("battlefield");
  // Lightning Bolt on the Giant: the chosen creature leaves, Zenos transforms, and you choose an opponent.
  await card(page, "Lightning Bolt", s).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "player");
  const bar = controls(page);
  await expect(bar).toContainText("choose an opponent");
  await expect(bar.getByRole("button", { name: /^You/ })).toHaveCount(0);
  await bar.getByRole("button", { name: "Ana", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[zenos]!.chosen?.player === 1);
  expect(after.objects[zenos]!.face).toBe(1);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("The Legend of Yangchen: chapter I, you choose first, only among your opponents' permanents with mana value 3 or more", async ({ page }) => {
  const s = scene({ hand: [YANGCHEN], board: [...LANDS, "Hill Giant"] }, [{ board: ["Craw Wurm", "Grizzly Bears"] }]);
  const [wurm, bears, mine] = [one(s, "Craw Wurm"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "The Legend of Yangchen", s).click();
  const pick = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  expect((pick.pending as { options: string[] }).options).toEqual([wurm]);
  await expect(controls(page)).toContainText("exiles each permanent chosen this way");
  await page.locator(`[data-obj="${wurm}"]`).click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[wurm]!.zone === "exile");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[mine]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Summon: Esper Valigarmanda: chapter II adds {R}{R}; cast Ana's exiled Divination with it, mana of any type", async ({ page }) => {
  const s0 = scene({ board: ["Summon: Esper Valigarmanda", "Mountain"] }, [{ exile: ["Divination"] }]);
  const [saga, div] = [one(s0, "Summon: Esper Valigarmanda"), one(s0, "Divination")];
  s0.objects[saga]!.counters.lore = 1;
  s0.linkedExile = { [`${saga}@${s0.objects[saga]!.zoneChanges ?? 0}`]: [{ id: div, zc: s0.objects[div]!.zoneChanges ?? 0 }] };
  const s = playUntil(s0, (st) => st.turn > s0.turn && st.pending?.kind === "chooseOption" && st.pending.player === 0 && st.pending.what === "castFromAmong");
  expect(s.players[0]!.manaPool.R).toBe(2);
  await open(page, s);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Divination" }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  // {2}{U}: {R}{R} from the chapter and the Mountain.
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "graveyard");
  expect(after.players[1]!.graveyard).toContain(div);
  expect(after.players[0]!.hand.length).toBe(s.players[0]!.hand.length + 2);
  expect(pageErrors(page)).toEqual([]);
});

test("Triple Triad: at your upkeep your Hill Giant and Ana's cheaper Grizzly Bears are yours to cast free; Ben's Craw Wurm isn't", async ({ page }) => {
  // Each opponent draws a card on their turn first, so their card goes second from the top.
  const s0 = scene({ board: ["Triple Triad"], library: ["Hill Giant"] }, [{ library: ["Forest", "Grizzly Bears"] }, { library: ["Forest", "Craw Wurm"] }]);
  const [giant, bears, wurm] = [one(s0, "Hill Giant"), one(s0, "Grizzly Bears"), one(s0, "Craw Wurm")];
  const s = playUntil(s0, (st) => st.turn > s0.turn && st.activePlayer === 0 && st.step === "main1" && st.stack.length === 0);
  expect(s.objects[bears]!.mayPlay).toMatchObject({ player: 0, free: true });
  expect(s.objects[wurm]!.mayPlay).toBeUndefined();
  await open(page, s);
  // Ana's exile, then yours: each opens a window of the cards there.
  const castFrom = async (pid: 0 | 1, name: string) => {
    await seat(page, pid).locator(".zone", { hasText: "Exile" }).click();
    await modal(page).locator(".card.playable", { hasText: name }).click();
    await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  };
  await castFrom(1, "Grizzly Bears");
  let after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  await castFrom(0, "Hill Giant");
  after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  // Free: no land was tapped.
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.tapped).length).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Tasha, the Witch Queen: −3 offers Ana's and Ben's cards with page counters, not one without; cast Ana's Bolt free", async ({ page }) => {
  const s = scene({ board: ["Tasha, the Witch Queen"] }, [{ exile: ["Lightning Bolt"] }, { exile: ["Divination", "Shock"] }]);
  const [tasha, bolt, div, shock] = [one(s, "Tasha, the Witch Queen"), one(s, "Lightning Bolt"), one(s, "Divination"), one(s, "Shock")];
  s.objects[tasha]!.counters.loyalty = 5;
  s.objects[bolt]!.counters.page = 1;
  s.objects[div]!.counters.page = 1;
  await open(page, s);
  await page.locator(`[data-obj="${tasha}"]`).click();
  await menu(page).locator("button", { hasText: "−3" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong");
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Divination" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Shock" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Lightning Bolt" }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 2);
  const demons = (st: GameState) => st.battlefield.filter((id) => /Demon/.test(st.cards[st.objects[id]!.cardId]!.name)).length;
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect(after.players[2]!.life).toBe(s.players[2]!.life - 3);
  expect(after.players[1]!.graveyard).toContain(bolt);
  // A spell you don't own: Tasha's first ability makes a 3/3 Demon.
  expect(demons(after)).toBe(1);
  expect(after.objects[div]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
