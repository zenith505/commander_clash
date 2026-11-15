// Lane B round B216 in the browser: Preferred Selection's question at your upkeep (the two cards you looked at named, Pay
// sacrifices it for one of them; Don't pay sends one to the bottom), Forbidden Ritual's "repeat the process?" after each
// sacrifice, and Curse of the Cabal's question at your own upkeep while it's suspended.
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, resolveUntil } from "./ui";

test("Preferred Selection: at your upkeep, pay to sacrifice it and put Llanowar Elves into your hand; Hill Giant stays on top", async ({ page }) => {
  const s0 = scene({ board: ["Preferred Selection", "Forest", "Forest", "Forest", "Forest"], library: ["Hill Giant", "Llanowar Elves"] });
  const [sel, giant, elves] = [one(s0, "Preferred Selection"), idsOf(s0, "Hill Giant", "library", 0)[0]!, idsOf(s0, "Llanowar Elves", "library", 0)[0]!];
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  expect(s.step).toBe("upkeep");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Preferred Selection:");
  await expect(bar).toContainText("Hill Giant and Llanowar Elves");
  await expect(bar).toContainText("If you don't, one of them goes on the bottom of your library.");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "lookedCard");
  expect(asked.objects[sel]!.zone).toBe("graveyard");
  await expect(bar).toContainText("put one of those cards into your hand");
  await bar.getByRole("button", { name: "Llanowar Elves" }).click();
  const after = await resolveUntil(page, (st) => st.objects[elves]!.zone === "hand");
  expect(after.players[0]!.library[0]).toBe(giant);
  expect(pageErrors(page)).toEqual([]);
});

test("Preferred Selection: don't pay, and Hill Giant goes to the bottom; Llanowar Elves stays on top and the enchantment stays", async ({ page }) => {
  const s0 = scene({ board: ["Preferred Selection", "Forest", "Forest", "Forest", "Forest"], library: ["Hill Giant", "Llanowar Elves"] });
  const [sel, giant, elves] = [one(s0, "Preferred Selection"), idsOf(s0, "Hill Giant", "library", 0)[0]!, idsOf(s0, "Llanowar Elves", "library", 0)[0]!];
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Don't pay" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "lookedCard");
  await expect(bar).toContainText("put one of those cards on the bottom of your library");
  await bar.getByRole("button", { name: "Hill Giant" }).click();
  const after = await resolveUntil(page, (st) => st.players[0]!.library.at(-1) === giant);
  expect(after.players[0]!.library[0]).toBe(elves);
  expect(after.objects[sel]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Forbidden Ritual: sacrifice Grizzly Bears, Ana loses 2; repeat with Hill Giant, Ana loses 2 more; then stop", async ({ page }) => {
  const s = scene({ hand: ["Forbidden Ritual"], board: ["Swamp", "Swamp", "Swamp", "Swamp", "Grizzly Bears", "Hill Giant"] }, [{}]);
  const [bears, giant, ritual] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Forbidden Ritual")];
  await open(page, s);
  await card(page, "Forbidden Ritual", s).click();
  await clickPlayer(page, 1);
  const bar = controls(page);
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "sacrifice" && st.pending.player === 0);
  const sac = bar.getByRole("button", { name: "Sacrifice", exact: true });
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await sac.click();
  const first = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && !!st.pending.repeat);
  expect(first.objects[bears]!.zone).toBe("graveyard");
  expect(first.players[1]!.life).toBe(38);
  await expect(bar).toContainText("Repeat the process: sacrifice a nontoken permanent");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "sacrifice" && st.pending.player === 0);
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await sac.click();
  const second = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && !!st.pending.repeat);
  expect(second.objects[giant]!.zone).toBe("graveyard");
  expect(second.players[1]!.life).toBe(36);
  await bar.getByRole("button", { name: "No" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ritual]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(36);
  expect(pageErrors(page)).toEqual([]);
});

test("Curse of the Cabal: suspended, at your upkeep you may sacrifice a permanent; sacrificing Grizzly Bears puts two time counters on it", async ({ page }) => {
  const s0 = scene({ exile: ["Curse of the Cabal"], board: ["Grizzly Bears", "Forest"] });
  const [curse, bears] = [one(s0, "Curse of the Cabal"), one(s0, "Grizzly Bears")];
  s0.objects[curse]!.counters.time = 2;
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  expect(s.step).toBe("upkeep");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Curse of the Cabal:");
  await expect(bar).toContainText("Sacrifice a permanent to put two time counters on Curse of the Cabal");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "sacrifice" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Sacrifice", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[bears]!.zone === "graveyard" && st.stack.length === 0 && !st.pending && st.triggerQueue.length === 0);
  // Two on from the Curse, one off from suspend, in either order.
  expect(after.objects[curse]!.counters.time).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});
