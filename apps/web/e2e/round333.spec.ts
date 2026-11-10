// Round 333's prompts: Feather, Radiant Arbiter's pick of the creatures to copy a spell for (paying {2} each), Zevlor,
// Elturel Exile's choice of the player or permanent each other opponent's copy targets, and Alhammarret, High Arbiter's
// name picker offering only the nonland cards its opponents revealed.
import { expect, test } from "@playwright/test";
import { power, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

/** Waits until the spell just cast is on the stack. */
async function onStack(page: import("@playwright/test").Page, n = 1): Promise<GameState> {
  let st: GameState = await state(page);
  for (let i = 0; i < 50 && st.stack.length < n; i++) {
    await page.waitForTimeout(100);
    st = await state(page);
  }
  return st;
}

test("Feather: Giant Growth on Feather, then click your Grizzly Bears and pay {2}: a copy targets it", async ({ page }) => {
  const s = scene({ hand: ["Giant Growth"], board: [...LANDS, "Feather, Radiant Arbiter", "Grizzly Bears"] }, [{ board: ["Grizzly Bears"] }]);
  const feather = one(s, "Feather, Radiant Arbiter");
  const [bears] = idsOf(s, "Grizzly Bears", "battlefield", 0);
  const [theirs] = idsOf(s, "Grizzly Bears", "battlefield", 1);
  await open(page, s);
  await card(page, "Giant Growth", s).click();
  await page.locator(`[data-obj="${feather}"]`).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0, 40);
  const p = asked.pending as { options: string[]; action: string };
  expect(p.action).toBe("copyFor");
  expect([...p.options].sort()).toEqual([bears!, theirs!].sort());
  const bar = controls(page);
  await expect(bar).toContainText("Feather, Radiant Arbiter:");
  await expect(bar).toContainText("paying {2} for each");
  await expect(bar.getByRole("button", { name: "Copy none" })).toBeEnabled();
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Pay {2} and copy 1" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && power(st, st.objects[bears!]!) === 5, 40);
  expect(power(after, after.objects[feather]!)).toBe(7);
  expect(power(after, after.objects[theirs!]!)).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Zevlor: Lightning Bolt at Ana is copied for Ben (at his Grizzly Bears) and for Cy", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Zevlor, Elturel Exile"] }, [{}, { board: ["Grizzly Bears"] }, {}]);
  const zevlor = one(s, "Zevlor, Elturel Exile");
  const [bears] = idsOf(s, "Grizzly Bears", "battlefield", 2);
  await open(page, s);
  await page.locator(`[data-obj="${zevlor}"]`).click();
  const item = menu(page).locator("button", { hasText: "When you next cast" });
  if (await item.count()) await item.click();
  const armed = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.nextCast?.length ?? 0) === 1, 40);
  expect(armed.objects[zevlor]!.tapped).toBe(true);
  await card(page, "Lightning Bolt", s).click();
  await clickPlayer(page, 1);
  await onStack(page);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "copyTargetFor", 40);
  const bar = controls(page);
  await expect(bar).toContainText("for Ben, choose that player or a permanent they control");
  await bar.getByRole("button", { name: "Grizzly Bears (Ben)" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "copyTargetFor" && !!st.pending.prompt?.startsWith("for Cy"), 40);
  await expect(bar).toContainText("for Cy, choose that player or a permanent they control");
  await bar.getByRole("button", { name: "Cy", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === 37, 40);
  expect(after.players[3]!.life).toBe(37);
  expect(after.players[2]!.life).toBe(40);
  expect(after.objects[bears!]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Alhammarret: the name picker offers only the nonland cards the opponents revealed", async ({ page }) => {
  const s = scene({ hand: ["Alhammarret, High Arbiter"], board: LANDS }, [{ hand: ["Lightning Bolt", "Forest"] }, { hand: ["Counterspell"] }]);
  await open(page, s);
  await card(page, "Alhammarret, High Arbiter", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "cardName", 40);
  expect((asked.pending as { options: string[] }).options).toEqual(["Counterspell", "Lightning Bolt"]);
  const pick = modal(page);
  await expect(pick).toContainText("Alhammarret, High Arbiter: choose the name of a nonland card your opponents revealed");
  await pick.locator("input").fill("counter");
  await pick.locator('[data-name="Counterspell"]').click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0, 40);
  const al = after.battlefield.find((id) => after.cards[after.objects[id]!.cardId]!.name === "Alhammarret, High Arbiter")!;
  expect(after.objects[al]!.chosen?.name).toBe("Counterspell");
  expect(after.log.some((l) => /Ana reveals their hand for Alhammarret, High Arbiter: (Forest, Lightning Bolt|Lightning Bolt, Forest)\./.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
