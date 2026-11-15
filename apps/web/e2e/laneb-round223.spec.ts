// Lane B round B223 in the browser: Disciple of Caelus Nin's "choose up to five permanents" pick, the rest phasing out;
// Goblin Artisans' target, your artifact spell on the stack, then its coin flip.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";
import { defOf } from "@cc/engine";

test("Disciple of Caelus Nin: keep Hill Giant; your lands phase out, Ana keeps both her creatures, nothing can phase in", async ({ page }) => {
  const s = scene({ hand: ["Disciple of Caelus Nin"], board: [...LANDS, "Hill Giant"] }, [{ board: ["Craw Wurm", "Grizzly Bears"] }]);
  const [disciple, giant] = [one(s, "Disciple of Caelus Nin"), one(s, "Hill Giant")];
  const [wurm, bears] = [idsOf(s, "Craw Wurm", "battlefield", 1)[0]!, idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!];
  await open(page, s);
  await card(page, "Disciple of Caelus Nin", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  // The Disciple itself isn't offered.
  expect(asked.pending?.kind === "pickPermanents" && asked.pending.options.includes(disciple)).toBe(false);
  const bar = controls(page);
  await expect(bar).toContainText("click up to 5 permanents of yours to keep. The rest of yours (other than Disciple of Caelus Nin) phase out, and while Disciple of Caelus Nin is on the battlefield, permanents can't phase in.");
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await bar.getByRole("button", { name: "Keep 1", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield" && (st.phasedOut ?? []).length > 0);
  expect(after.objects[disciple]!.zone).toBe("battlefield");
  // Every land of yours phased out; Ana's two creatures were both kept.
  const yours = Object.values(after.objects).filter((o) => o.owner === 0 && (o.zone === "battlefield" || o.zone === "phasedOut") && defOf(after, o).typeLine.includes("Land"));
  expect(yours.length).toBe(LANDS.length);
  expect(yours.every((o) => o.zone === "phasedOut")).toBe(true);
  expect([wurm, bears].map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Goblin Artisans: with Sol Ring on the stack, its ability targets that spell; then the coin flip draws a card or counters it", async ({ page }) => {
  const s = scene({ hand: ["Sol Ring"], board: [...LANDS, "Goblin Artisans"] });
  const [ring, artisans] = [one(s, "Sol Ring"), one(s, "Goblin Artisans")];
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await card(page, "Sol Ring", s).click();
  // The spell's id from the state the poll saw (not a second read, which could race the game on).
  let spell = "";
  await expect
    .poll(async () => {
      const st = await state(page);
      spell = st.stack[0]?.id ?? "";
      return st.stack.length;
    })
    .toBe(1);
  await page.locator(`[data-obj="${artisans}"]`).first().click();
  await menu(page).getByRole("button", { name: /Flip a coin\. If you win the flip, draw a card/ }).click();
  await expect(page.locator(".targeting")).toContainText("target artifact spell you control that isn't the target of an ability from another creature named Goblin Artisans");
  await page.locator(`[data-stack="${spell}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.log.some((e) => /flips a coin for Goblin Artisans and (wins|loses) the flip/.test(e.text)));
  const won = after.log.some((e) => /flips a coin for Goblin Artisans and wins the flip/.test(e.text));
  expect(after.objects[artisans]!.tapped).toBe(true);
  expect(after.objects[ring]!.zone).toBe(won ? "battlefield" : "graveyard");
  expect(after.players[0]!.hand.length).toBe(won ? hand : hand - 1);
  expect(pageErrors(page)).toEqual([]);
});
