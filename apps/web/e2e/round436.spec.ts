// Round 436: Terra, Magical Adept // Esper Terra (Trance, then chapter I copies History of Benalia and asks how many more
// lore counters to put on the token, 0 to 3) and The Day of the Doctor's chapter IV (click up to three Doctors, anyone's,
// then choose whether to exile all other creatures for 13 damage).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Esper Terra: chapter I copies History of Benalia, you add two lore counters, and the copy's three chapters make two Knights", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Terra, Magical Adept // Esper Terra", "History of Benalia"] });
  const [terra, hist] = [one(s, "Terra, Magical Adept"), one(s, "History of Benalia")];
  await open(page, s);
  await page.locator(`[data-obj="${terra}"]`).first().click();
  const m = page.locator(".ability-menu");
  if (await m.isVisible().catch(() => false)) await m.locator("button", { hasText: /Exile Terra/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await page.locator(`[data-obj="${hist}"]`).first().click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "number" && x.pending.player === 0);
  const copy = st.battlefield.find((id) => st.objects[id]!.isToken && st.cards[st.objects[id]!.cardId]?.name === "History of Benalia")!;
  expect(st.objects[copy]!.counters.lore).toBe(1);
  const bar = controls(page);
  await expect(bar).toContainText("put how many lore counters on the token (0 to 3)?");
  await bar.getByRole("button", { name: "Number plus one" }).click();
  await bar.getByRole("button", { name: "Number plus one" }).click();
  await bar.getByRole("button", { name: "Choose 2" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.triggerQueue.length === 0 && !x.objects[copy]);
  const knights = after.battlefield.filter((id) => after.objects[id]!.isToken && after.objects[id]!.controller === 0 && /Knight/.test(after.cards[after.objects[id]!.cardId]?.name ?? ""));
  expect(knights).toHaveLength(2);
  expect(after.objects[hist]!.zone).toBe("battlefield");
  await expect(page.locator(`[data-obj="${terra}"]`).first()).toContainText("Esper Terra");
  expect(pageErrors(page)).toEqual([]);
});

test("The Day of the Doctor IV: keep Cult Healer and an opponent's Dominion Supervisor, exile the Bears, take 13", async ({ page }) => {
  const s = scene({ board: [...LANDS, "The Day of the Doctor", "Cult Healer", "Grizzly Bears"] }, [{ board: ["Dominion Supervisor", "Grizzly Bears"] }]);
  const saga = one(s, "The Day of the Doctor");
  s.objects[saga]!.counters = { lore: 3 };
  // Its fourth lore counter comes as the precombat main phase begins (CR 714.3b).
  s.step = "draw";
  const named = (n: string, pid: number) => s.battlefield.find((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === n)!;
  const [healer, myBears, sup, theirBears] = [named("Cult Healer", 0), named("Grizzly Bears", 0), named("Dominion Supervisor", 1), named("Grizzly Bears", 1)];
  const life = s.players[0]!.life;
  await open(page, s);
  const st = await resolveUntil(page, (x) => x.pending?.kind === "pickPermanents" && x.pending.action === "choose" && x.pending.player === 0);
  expect([...(st.pending as { options: string[] }).options].sort()).toEqual([healer, sup].sort());
  const bar = controls(page);
  await expect(bar).toContainText("Doctors");
  await page.locator(`[data-obj="${healer}"]`).first().click();
  await page.locator(`[data-obj="${sup}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseMay" && x.pending.player === 0);
  await expect(bar).toContainText("xile all other creatures");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[saga]!.zone === "graveyard");
  expect([healer, sup].map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "battlefield"]);
  expect([myBears, theirBears].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile"]);
  expect(after.players[0]!.life).toBe(life - 13);
  expect(pageErrors(page)).toEqual([]);
});
