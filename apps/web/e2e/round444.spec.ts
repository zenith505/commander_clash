// Round 444: Altaïr Ibn-La'Ahad (attacking, you click Royal Assassin in your graveyard to exile with a memory counter,
// then whom each token copy attacks: the Assassin's and Llanowar Elves', already in exile with one) and The Animus (tap it:
// Isamaru becomes a copy of Craw Wurm, in Ana's exile with a memory counter, until your next turn).
import { expect, test } from "@playwright/test";
import type { GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { attack, controls, menu, modal, passTo, resolveUntil } from "./ui";

test("Altaïr Ibn-La'Ahad: attacking, exile Royal Assassin with a memory counter, and click whom each token copy attacks", async ({ page }) => {
  const s: GameState = scene({ board: [...LANDS, "Altaïr Ibn-La'Ahad"], yard: ["Royal Assassin", "Grizzly Bears"], exile: ["Llanowar Elves"] });
  const [altair, assassin, bears, elves] = [one(s, "Altaïr Ibn-La'Ahad"), one(s, "Royal Assassin"), one(s, "Grizzly Bears"), idsOf(s, "Llanowar Elves", "exile", 0)[0]!];
  s.objects[elves]!.counters = { memory: 1 };
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0, 60);
  await attack(page, [[altair, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  // Grizzly Bears isn't an Assassin: not offered.
  await expect(modal(page).locator(`[data-pick="${bears}"]`)).toHaveCount(0);
  await modal(page).locator(`[data-pick="${assassin}"]`).click();
  const first = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "attackWhom");
  expect(first.objects[assassin]!.zone).toBe("exile");
  expect(first.objects[assassin]!.counters.memory).toBe(1);
  await expect(controls(page)).toContainText("choose what the token copy of Llanowar Elves attacks (1 of 2)");
  await controls(page).getByRole("button", { name: "Ana", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "attackWhom" && /Royal Assassin/.test((st.pending as { prompt?: string }).prompt ?? ""));
  await controls(page).getByRole("button", { name: "Ben", exact: true }).click();
  const made = await resolveUntil(page, (st) => st.battlefield.filter((id) => st.objects[id]!.isToken).length === 2);
  const tokens = made.battlefield.filter((id) => made.objects[id]!.isToken);
  const name = (id: string) => made.cards[made.objects[id]!.cardId]!.name;
  expect(tokens.map((id) => [name(id), made.objects[id]!.attacking, made.objects[id]!.tapped]).sort()).toEqual([["Llanowar Elves", 1, true], ["Royal Assassin", 2, true]]);
  // Exiled at end of combat; the cards stay in exile with their counters.
  const after = await passTo(page, "main2");
  expect(tokens.filter((id) => after.battlefield.includes(id))).toEqual([]);
  expect([after.objects[assassin]!.zone, after.objects[elves]!.zone]).toEqual(["exile", "exile"]);
  expect(pageErrors(page)).toEqual([]);
});

test("The Animus: tap it, click Isamaru, then Craw Wurm in Ana's exile, and Isamaru is a Craw Wurm until your next turn", async ({ page }) => {
  const s: GameState = scene({ board: [...LANDS, "The Animus", "Isamaru, Hound of Konda"] }, [{ exile: ["Craw Wurm", "Grizzly Bears"] }]);
  const [animus, isamaru, wurm, bears] = [one(s, "The Animus"), one(s, "Isamaru, Hound of Konda"), one(s, "Craw Wurm"), one(s, "Grizzly Bears")];
  s.objects[wurm]!.counters = { memory: 1 };
  await open(page, s);
  await page.locator(`[data-obj="${animus}"]`).click();
  const item = menu(page).getByRole("button", { name: /becomes a copy of target creature card in exile with a memory counter/ });
  if (await item.count()) await item.first().click();
  await page.locator(`[data-obj="${isamaru}"]`).click();
  // Grizzly Bears has no memory counter: not offered.
  await expect(modal(page).locator(`[data-pick="${wurm}"]`)).toHaveCount(1);
  await expect(modal(page).locator(`[data-pick="${bears}"]`)).toHaveCount(0);
  await modal(page).locator(`[data-pick="${wurm}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[animus]!.tapped && st.log.some((l) => /becomes a copy of Craw Wurm/.test(l.text)));
  expect(after.log.some((l) => /Isamaru, Hound of Konda becomes a copy of Craw Wurm until .*next turn/.test(l.text))).toBe(true);
  expect(after.objects[wurm]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
