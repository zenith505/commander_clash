// Round 315: additional costs of any size as a spell is cast, X the number: Explosive Singularity's and Burn at the
// Stake's tapped creatures (picked on the battlefield), Hierophant Bio-Titan's removed +1/+1 counters (the counter
// window), Dargo, the Shipwrecker's sacrifices, Galloping Lizrog's counters picked one at a time as it enters, and
// activation costs of any size: Baba Lysaga's "sacrifice up to three permanents", Ooze Flux's and The Astonishing Ant-Man's
// removed +1/+1 counters.
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

const CREW = ["Grizzly Bears", "Hill Giant", "Coral Merfolk", "Raging Goblin", "Savannah Lions", "Goblin Piker"];

test("Explosive Singularity: X starts at the fewest creatures four lands need; tap six and deal 10 to Ana", async ({ page }) => {
  const s = scene({ hand: ["Explosive Singularity"], board: ["Mountain", "Mountain", "Forest", "Island", ...CREW] });
  const crew = CREW.map((n) => one(s, n));
  const ana = s.players.find((p) => p.name === "Ana")!.id;
  await open(page, s);
  await card(page, "Explosive Singularity", s).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("tap X untapped creatures you control, each making it {1} cheaper: choose X");
  await expect(x.getByLabel("X", { exact: true })).toHaveValue("6");
  await x.getByRole("button", { name: "X = 6" }).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("Explosive Singularity (X=6): choose any target");
  await clickPlayer(page, ana);
  await expect(bar).toContainText("Explosive Singularity: tap 6 untapped creatures you control");
  for (const c of crew) await page.locator(`[data-obj="${c}"]`).click();
  await bar.getByRole("button", { name: "Tap and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[ana]!.life === s.players[ana]!.life - 10);
  expect(crew.every((c) => after.objects[c]!.tapped)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Burn at the Stake: X can be up to your untapped creatures; tap two for 6 damage to Ana", async ({ page }) => {
  const s = scene({ hand: ["Burn at the Stake"], board: ["Mountain", "Mountain", "Mountain", "Forest", "Island", "Grizzly Bears", "Hill Giant", "Coral Merfolk"] });
  const [bears, giant, merfolk] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Coral Merfolk")];
  const ana = s.players.find((p) => p.name === "Ana")!.id;
  await open(page, s);
  await card(page, "Burn at the Stake", s).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("tap X untapped creatures you control (X can be 0): choose X");
  await expect(x.getByLabel("X", { exact: true })).toHaveValue("3");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const bar = page.locator(".targeting");
  await clickPlayer(page, ana);
  await expect(bar).toContainText("Burn at the Stake: tap 2 untapped creatures you control");
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Tap and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[ana]!.life === s.players[ana]!.life - 6);
  expect([bears, giant, merfolk].map((c) => after.objects[c]!.tapped)).toEqual([true, true, false]);
  expect(pageErrors(page)).toEqual([]);
});

test("Hierophant Bio-Titan: X starts at five with two Forests; pick five +1/+1 counters in the counter window", async ({ page }) => {
  const s = scene({ hand: ["Hierophant Bio-Titan"], board: ["Forest", "Forest", "Grizzly Bears", "Hill Giant"] });
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[bears]!.counters["+1/+1"] = 3;
  s.objects[giant]!.counters["+1/+1"] = 2;
  await open(page, s);
  await card(page, "Hierophant Bio-Titan", s).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("remove X +1/+1 counters from among creatures you control, each making it {2} cheaper: choose X");
  await expect(x.getByLabel("X", { exact: true })).toHaveValue("5");
  await x.getByRole("button", { name: "X = 5" }).click();
  const pick = page.locator(".counter-pick");
  await expect(pick).toContainText("0 of 5 chosen");
  for (let i = 0; i < 3; i++) await pick.locator(`[data-counter="${bears}:+1/+1"]`).getByRole("button", { name: "+" }).click();
  for (let i = 0; i < 2; i++) await pick.locator(`[data-counter="${giant}:+1/+1"]`).getByRole("button", { name: "+" }).click();
  await expect(pick).toContainText("5 of 5 chosen");
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.cards[st.objects[id]!.cardId]!.name === "Hierophant Bio-Titan"));
  expect(after.objects[bears]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(after.objects[giant]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Dargo, the Shipwrecker: sacrifice two artifacts and creatures as it's cast, {2} off for each", async ({ page }) => {
  const s = scene({ hand: ["Dargo, the Shipwrecker"], board: ["Mountain", "Mountain", "Mountain", "Grizzly Bears", "Sol Ring", "Hill Giant"] });
  const [bears, ring, giant] = [one(s, "Grizzly Bears"), one(s, "Sol Ring"), one(s, "Hill Giant")];
  s.objects[ring]!.tapped = true; // its mana isn't there to pay with
  await open(page, s);
  await card(page, "Dargo, the Shipwrecker", s).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("sacrifice X artifact or creatures, each making it {2} cheaper: choose X");
  await expect(x.getByLabel("X", { exact: true })).toHaveValue("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("Dargo, the Shipwrecker: sacrifice");
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${ring}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.cards[st.objects[id]!.cardId]!.name === "Dargo, the Shipwrecker"));
  expect([bears, ring, giant].map((c) => after.objects[c]!.zone)).toEqual(["graveyard", "graveyard", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Galloping Lizrog: as it enters, pick two +1/+1 counters off your Bears; four go on it", async ({ page }) => {
  const s = scene({ hand: ["Galloping Lizrog"], board: ["Forest", "Forest", "Forest", "Island", "Island", "Grizzly Bears"] });
  const bears = one(s, "Grizzly Bears");
  const liz = one(s, "Galloping Lizrog");
  s.objects[bears]!.counters["+1/+1"] = 2;
  await open(page, s);
  await card(page, "Galloping Lizrog", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "removeCounter");
  const bar = controls(page);
  await expect(bar).toContainText("choose a counter to remove (0 so far)");
  await bar.getByRole("button", { name: "A +1/+1 counter from Grizzly Bears (2 left)" }).click();
  await expect(bar).toContainText("(1 so far)");
  await bar.getByRole("button", { name: "A +1/+1 counter from Grizzly Bears (1 left)" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[liz]!.counters["+1/+1"] ?? 0) === 4);
  expect(after.objects[bears]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Baba Lysaga, Night Witch: X = 3, sacrifice an artifact, a creature and a land; drain 3 and draw three", async ({ page }) => {
  const s = scene({ board: ["Baba Lysaga, Night Witch", "Sol Ring", "Grizzly Bears", "Forest"], library: ["Island", "Island", "Island"] });
  const [baba, ring, bears, forest] = [one(s, "Baba Lysaga, Night Witch"), one(s, "Sol Ring"), one(s, "Grizzly Bears"), idsOf(s, "Forest", "battlefield", 0)[0]!];
  const ana = s.players.find((p) => p.name === "Ana")!.id;
  await open(page, s);
  await card(page, "Baba Lysaga, Night Witch", s).click();
  const item = menu(page).locator("button", { hasText: "If there were three or more card types" });
  if (await item.count()) await item.click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("sacrifice X permanents");
  await x.getByLabel("X", { exact: true }).fill("3");
  await x.getByRole("button", { name: "X = 3" }).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("sacrifice 3 permanents");
  for (const id of [ring, bears, forest]) await page.locator(`[data-obj="${id}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and activate" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[ana]!.life === s.players[ana]!.life - 3);
  expect([ring, bears, forest].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard"]);
  expect(after.objects[baba]!.tapped).toBe(true);
  expect(after.players[0]!.hand.length).toBe(s.players[0]!.hand.length + 3);
  expect(pageErrors(page)).toEqual([]);
});

test("Ooze Flux: X = 3 counters from among your creatures, picked in the counter window, make a 3/3 Ooze", async ({ page }) => {
  const s = scene({ board: ["Ooze Flux", "Forest", "Mountain", "Grizzly Bears", "Hill Giant"] });
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[bears]!.counters["+1/+1"] = 1;
  s.objects[giant]!.counters["+1/+1"] = 2;
  await open(page, s);
  await card(page, "Ooze Flux", s).click();
  const item = menu(page).locator("button", { hasText: "Create an X/X green Ooze" });
  if (await item.count()) await item.click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("remove X +1/+1 counters from among creatures you control");
  await x.getByLabel("X", { exact: true }).fill("3");
  await x.getByRole("button", { name: "X = 3" }).click();
  const pick = page.locator(".counter-pick");
  await expect(pick).toContainText("0 of 3 chosen");
  await pick.locator(`[data-counter="${bears}:+1/+1"]`).getByRole("button", { name: "+" }).click();
  for (let i = 0; i < 2; i++) await pick.locator(`[data-counter="${giant}:+1/+1"]`).getByRole("button", { name: "+" }).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.cards[st.objects[id]!.cardId]!.name === "Ooze Token"));
  const ooze = after.battlefield.find((id) => after.cards[after.objects[id]!.cardId]!.name === "Ooze Token")!;
  expect(after.cards[after.objects[ooze]!.cardId]!.power).toBe("3");
  expect([after.objects[bears]!.counters["+1/+1"] ?? 0, after.objects[giant]!.counters["+1/+1"] ?? 0]).toEqual([0, 0]);
  expect(pageErrors(page)).toEqual([]);
});

test("The Astonishing Ant-Man: X = 2 of its +1/+1 counters make two Insects", async ({ page }) => {
  const s = scene({ board: ["The Astonishing Ant-Man", "Forest", "Forest", "Island"] });
  const ant = one(s, "The Astonishing Ant-Man");
  s.objects[ant]!.counters["+1/+1"] = 3;
  await open(page, s);
  await card(page, "The Astonishing Ant-Man", s).click();
  const item = menu(page).locator("button", { hasText: "Insect" });
  if (await item.count()) await item.click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("remove X +1/+1 counters");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.filter((id) => st.cards[st.objects[id]!.cardId]!.name === "Insect Token").length === 2);
  expect(after.objects[ant]!.counters["+1/+1"]).toBe(1);
  expect(after.objects[ant]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
