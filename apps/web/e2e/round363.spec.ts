// Round 363: Deceiver of Form's two questions at the beginning of your combat (have your other creatures become copies
// of the revealed creature card, then put that card on the bottom), Vesuvan Drifter's "you may reveal the top card of
// your library", and Gale's Redirection exiling a spell from the stack, then that card cast from your exile.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil, seat } from "./ui";

test("Deceiver of Form: Yes to the copies, Yes to the bottom: Gray Ogre is a Serra Angel this turn", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Deceiver of Form", "Gray Ogre"], library: ["Serra Angel"] });
  const [ogre, angel] = [one(s, "Gray Ogre"), one(s, "Serra Angel")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Deceiver of Form: Have creatures you control other than Deceiver of Form become copies of that card until end of turn?");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && st.log.some((l) => /Gray Ogre becomes a copy of Serra Angel/.test(l.text)));
  await expect(bar).toContainText("Deceiver of Form: Put that card on the bottom of your library?");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.players[0]!.library.at(-1) === angel);
  expect(after.objects[angel]!.zone).toBe("library");
  expect(after.objects[ogre]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Vesuvan Drifter: Yes, reveal the top card: it's a Gray Ogre with flying until end of turn", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Vesuvan Drifter"], library: ["Gray Ogre"] });
  const ogre = one(s, "Gray Ogre");
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Vesuvan Drifter: Reveal the top card of your library?");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.log.some((l) => /Vesuvan Drifter becomes a copy of Gray Ogre until end of turn/.test(l.text)));
  expect(after.players[0]!.library[0]).toBe(ogre);
  expect(after.log.some((l) => /reveals Gray Ogre/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Gale's Redirection: exile your Divination from the stack, then cast it from your exile", async ({ page }) => {
  const s = scene({ hand: ["Divination", "Gale's Redirection"], board: LANDS });
  const div = one(s, "Divination");
  await open(page, s);
  await card(page, "Divination", s).click();
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  await card(page, "Gale's Redirection", s).click();
  const top = (await state(page)).stack.find((i) => i.objectId === div)!.id;
  await page.locator(`[data-stack="${top}"]`).click();
  const exiled = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "exile" && !!st.objects[div]!.mayPlay);
  // Divination's mana value 3 is added to the d20 (rulings); 15 or more casts it for free, less with mana of any color.
  const line = exiled.log.find((l) => /rolls a d20 for Gale's Redirection/.test(l.text))!.text;
  const total = Number(/= (\d+)\.$/.exec(line)![1]);
  expect(exiled.objects[div]!.mayPlay).toMatchObject(total >= 15 ? { until: "exiled", free: true } : { until: "exiled", anyColor: true });
  const hand = exiled.players[0]!.hand.length;
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "graveyard");
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect(pageErrors(page)).toEqual([]);
});
