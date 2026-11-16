// Lane B round B237 in the browser: Reed Richards' four draws offered beside Alhammarret's Archive's two; Chains of
// Mephistopheles' discard instead of each draw; Zur's Weirding asking you to pay 2 life when an opponent draws.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Reed Richards: your Divination's first draw can be his four cards, each doubled by the Archive", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Reed Richards, Smartest Man", "Alhammarret's Archive"] });
  await open(page, s);
  await card(page, "Divination", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "drawInstead" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Replace this draw");
  await expect(bar.getByRole("button", { name: "Draw two cards instead (Alhammarret's Archive)", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Draw four cards instead (Reed Richards, Smartest Man)", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Divination")]!.zone === "graveyard");
  // Four draws, each two; then Divination's second draw, two (Reed's first time is gone).
  expect(after.players[0]!.hand.length).toBe(10);
  expect(after.log.some((l) => l.text.startsWith("You draws four cards instead of one (Reed Richards, Smartest Man)."))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Chains of Mephistopheles: each draw of your Divination is a discard you pick, then a draw", async ({ page }) => {
  const s = scene({ hand: ["Divination", "Lightning Bolt", "Grizzly Bears"], board: LANDS, library: ["Hill Giant", "Shock"] }, [{ board: ["Chains of Mephistopheles"] }]);
  const [bolt, bears, giant, shock] = ["Lightning Bolt", "Grizzly Bears", "Hill Giant", "Shock"].map((n) => one(s, n)) as [string, string, string, string];
  await open(page, s);
  await card(page, "Divination", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "discard" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Chains of Mephistopheles: click 1 card in your hand to discard instead of drawing; then you draw a card.");
  await page.locator(`[data-obj="${bolt}"]`).first().click();
  await bar.getByRole("button", { name: "Discard" }).click();
  // The second draw asks again, with the Hill Giant drawn.
  let after = s;
  await expect.poll(async () => (after = await state(page)).objects[giant]!.zone).toBe("hand");
  await resolveUntil(page, (st) => st.pending?.kind === "discard" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Discard" }).click();
  after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[shock]!.zone === "hand");
  expect([bolt, bears, giant, shock].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "hand", "hand"]);
  expect(after.log.some((l) => l.text.startsWith("You discards Lightning Bolt instead of drawing (Chains of Mephistopheles)."))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Zur's Weirding: Ana's draw is revealed, and you pay 2 life to put it into her graveyard", async ({ page }) => {
  let s = scene({ board: ["Zur's Weirding"] }, [{ library: ["Lightning Bolt"] }, { life: 10 }, { life: 10 }]);
  const bolt = one(s, "Lightning Bolt");
  const life = s.players[0]!.life;
  // Ana's draw step: Ben and Cy (low on life, so the bots don't pay) are asked first, in turn order, then you.
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  expect(s.activePlayer).toBe(1);
  expect(s.step).toBe("draw");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Zur's Weirding: Pay 2 life to put Lightning Bolt into Ana's graveyard instead of Ana drawing it?");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  let after = s;
  await expect.poll(async () => (after = await state(page)).objects[bolt]!.zone).toBe("graveyard");
  expect(after.players[0]!.life).toBe(life - 2);
  expect(after.players[1]!.hand).not.toContain(bolt);
  expect(after.log.some((l) => l.text.startsWith("You pays 2 life, and Lightning Bolt goes into Ana's graveyard (Zur's Weirding)."))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
