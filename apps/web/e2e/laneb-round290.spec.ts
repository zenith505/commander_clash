// Lane B round B290 in the browser: "a name originally printed in the ... expansion". Golgothian Sylex (your Ornithopter, Ana's
// Ornithopter and Sylex itself are sacrificed, her Grizzly Bears stays), Apocalypse Chime (Ana's Baron Sengir is destroyed)
// and City in a Bottle (Ana's Juzám Djinn is sacrificed, and Kird Ape in your hand can't be cast).
import { expect, test } from "@playwright/test";
import type { GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, menu, resolveUntil } from "./ui";

/** The state once `done` holds (polled), kept: no second read after it. */
async function settled(page: Parameters<typeof state>[0], done: (s: GameState) => boolean): Promise<GameState> {
  let s: GameState | undefined;
  await expect.poll(async () => done((s = await state(page)))).toBe(true);
  return s!;
}

test("Golgothian Sylex: each nontoken permanent with an Antiquities name is sacrificed, Sylex too", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Golgothian Sylex", "Ornithopter"] }, [{ board: ["Ornithopter", "Grizzly Bears"] }]);
  const sylex = one(s, "Golgothian Sylex");
  const [mine, theirs] = [0, 1].map((p) => Object.values(s.objects).find((o) => o.zone === "battlefield" && o.owner === p && s.cards[o.cardId]!.name === "Ornithopter")!.id);
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Golgothian Sylex", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /Each nontoken permanent/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[sylex]!.zone === "graveyard");
  expect([after.objects[mine!]!.zone, after.objects[theirs!]!.zone, after.objects[bears]!.zone]).toEqual(["graveyard", "graveyard", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Apocalypse Chime: Ana's Baron Sengir is destroyed, her Grizzly Bears stays", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Apocalypse Chime"] }, [{ board: ["Baron Sengir", "Grizzly Bears"] }]);
  const [chime, baron, bears] = [one(s, "Apocalypse Chime"), one(s, "Baron Sengir"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Apocalypse Chime", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /Destroy all nontoken permanents/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[baron]!.zone === "graveyard");
  expect([after.objects[chime]!.zone, after.objects[bears]!.zone]).toEqual(["graveyard", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});

test("City in a Bottle: Ana's Juzám Djinn is sacrificed, and Kird Ape in your hand can't be cast", async ({ page }) => {
  const s = scene({ hand: ["Kird Ape", "Grizzly Bears"], board: [...LANDS, "City in a Bottle"] }, [{ board: ["Juzám Djinn"] }]);
  const [city, djinn] = [one(s, "City in a Bottle"), one(s, "Juzám Djinn")];
  await open(page, s);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.triggerQueue.length === 0 && st.objects[djinn]!.zone === "graveyard");
  expect(after.objects[city]!.zone).toBe("battlefield");
  await expect(card(page, "Grizzly Bears", s)).toHaveClass(/playable/);
  await expect(card(page, "Kird Ape", s)).not.toHaveClass(/playable/);
  const still = await settled(page, (st) => st.players[0]!.hand.length === 2);
  expect(still.objects[djinn]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
