// Round 416 in the browser: Vault 11: Voter's Dilemma's secret vote for up to one creature (the "Vote for no creature"
// button, then a creature), Blim, Comedic Genius's trigger after it deals combat damage to Ana (you click the permanent
// she gains control of), Aragorn, Company Leader when the Ring tempts you (the Ring-bearer, your choice of a keyword
// counter, then the creature that gets one too) and Invisible Woman, Sue Storm's Wall when Inspiring Roar puts counters
// on two other Heroes at once (one "you may").
import { expect, test } from "@playwright/test";
import { controllerOf } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, controls, passTo, resolveUntil } from "./ui";

test("Vault 11: Voter's Dilemma: chapter II asks for your secret vote; you click Vote for no creature, then for a creature at chapter III", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Vault 11: Voter's Dilemma", "Grizzly Bears"] }, [{ board: ["Serra Angel"] }, { board: ["Hill Giant"] }]);
  const vault = one(s0, "Vault 11: Voter's Dilemma");
  s0.objects[vault]!.counters.lore = 1;
  // Round the table to your next draw step: the lore counter, chapter II, and your vote (you vote first).
  const s = playUntil(s0, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "vote" && x.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("vote for up to one creature");
  await expect(bar.getByRole("button", { name: "Serra Angel (Ana)" })).toBeVisible();
  await bar.getByRole("button", { name: "Vote for no creature" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.log.some((l) => l.text.startsWith("The votes are revealed")));
  const reveal = after.log.find((l) => l.text.startsWith("The votes are revealed"))!.text;
  expect(reveal).not.toContain("You for");
  // The bots' votes were secret until then: nobody's "votes for" shows before the reveal.
  expect(after.log.filter((l) => /^(You|Ana|Ben|Cy) votes for /.test(l.text)).length).toBe(0);
  expect(after.log.filter((l) => /^(You|Ana|Ben|Cy) votes\.$/.test(l.text)).length).toBe(4);
  expect(after.objects[vault]!.counters.lore).toBe(2);
  expect(pageErrors(page)).toEqual([]);
  // Chapter III, next turn: a vote for the first creature offered.
  const s2 = playUntil(after, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "vote" && x.pending.player === 0 && x.objects[vault]!.counters.lore === 3);
  const label = (s2.pending as { labels?: string[] }).labels![0]!;
  expect(label).not.toBe("Vote for no creature");
  await open(page, s2);
  await controls(page).getByRole("button", { name: label, exact: true }).click();
  const end = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.log.filter((l) => l.text.startsWith("The votes are revealed")).length === 2);
  expect(end.log.filter((l) => l.text.startsWith("The votes are revealed")).pop()!.text).toContain(`You for ${label}`);
  expect(end.objects[vault]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Blim, Comedic Genius: it deals combat damage to Ana; you click your Grizzly Bears, she gains control of it, loses 1 life and discards a card", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Blim, Comedic Genius", "Grizzly Bears"] }, [{ hand: ["Hill Giant", "Hill Giant"] }]);
  const [blim, bears] = [one(s, "Blim, Comedic Genius"), one(s, "Grizzly Bears")];
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[blim, 1]]);
  const ask = await resolveUntil(page, (x) => x.pending?.kind === "chooseTargets" && x.pending.player === 0, 60);
  const life = ask.players[1]!.life;
  const hand = ask.players[1]!.hand.length;
  await expect(page.locator(".targeting")).toContainText("Blim, Comedic Genius");
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && controllerOf(x, x.objects[bears]!) === 1, 60);
  expect(after.players[1]!.life).toBe(life - 1);
  expect(after.players[1]!.hand.length).toBe(hand - 1);
  expect(after.players[0]!.life).toBe(40);
  expect(pageErrors(page)).toEqual([]);
});

test("Aragorn, Company Leader: the Ring tempts you, you choose Grizzly Bears as Ring-bearer, click a deathtouch counter, then the Bears for one too", async ({ page }) => {
  const s = scene({ hand: ["Birthday Escape"], board: [...LANDS, "Aragorn, Company Leader", "Grizzly Bears"] });
  const [aragorn, bears] = [one(s, "Aragorn, Company Leader"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Birthday Escape", s).click();
  await resolveUntil(page, (x) => x.pending?.kind === "pickPermanents" && x.pending.action === "ringBearer" && x.pending.player === 0);
  const bar = controls(page);
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Choose Ring-bearer" }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "either" && x.pending.player === 0);
  await expect(bar.getByRole("button", { name: "Put a first strike counter" })).toBeVisible();
  await bar.getByRole("button", { name: "Put a deathtouch counter" }).click();
  const target = await resolveUntil(page, (x) => x.pending?.kind === "chooseTargets" && x.pending.player === 0);
  expect(target.objects[aragorn]!.counters.deathtouch).toBe(1);
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && (x.objects[bears]!.counters.deathtouch ?? 0) === 1);
  expect(after.objects[aragorn]!.counters.deathtouch).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Invisible Woman, Sue Storm: Inspiring Roar puts counters on two other Heroes at once; one Yes makes one Wall", async ({ page }) => {
  const s = scene({ hand: ["Inspiring Roar"], board: [...LANDS, "Invisible Woman, Sue Storm", "Amateur Hero", "Hawkeye, Clint Barton"] });
  await open(page, s);
  await card(page, "Inspiring Roar", s).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseMay" && x.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Create a 0/4 colorless Wall creature token with defender");
  await bar.getByRole("button", { name: "Yes", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.battlefield.some((id) => x.objects[id]!.isToken));
  expect(after.battlefield.filter((id) => x(after, id)).length).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

const x = (s: Awaited<ReturnType<typeof resolveUntil>>, id: string) => s.objects[id]!.isToken && /^Wall/.test(s.cards[s.objects[id]!.cardId]?.name ?? "");
