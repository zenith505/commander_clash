// Lane B round B199 in the browser: Fraying Line asks the player whose upkeep it is to pay {2} (here you, at your upkeep,
// with Ana's Fraying Line), and Meandering Towershell, exiled as it attacked, comes back attacking at your next declare
// attackers step: you choose whom it attacks.
import { expect, test } from "@playwright/test";
import { applyAction, invalidateCharacteristics, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Fraying Line: at your upkeep, pay {2} and your Grizzly Bears get a rope counter", async ({ page }) => {
  let s = scene({ hand: ["Fraying Line"], board: [...LANDS, "Grizzly Bears"] });
  const [line, bears] = [one(s, "Fraying Line"), one(s, "Grizzly Bears")];
  // Onto the battlefield in Cy's end step (as if flashed in), so that your upkeep is the first one it sees.
  s = playUntil(s, (st) => st.activePlayer === 3 && st.step === "end" && !st.pending);
  const p = s.players[0]!;
  p.hand.splice(p.hand.indexOf(line), 1);
  s.objects[line]!.zone = "battlefield";
  s.battlefield.push(line);
  invalidateCharacteristics(s);
  s = playUntil(s, (st) => st.activePlayer === 0 && st.step === "upkeep" && st.pending?.kind === "chooseOption" && st.pending.what === "punisher" && st.pending.player === 0);
  const at: GameState = s;
  await open(page, at);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Don't" })).toBeVisible();
  await bar.getByRole("button", { name: "Pay {2}" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[bears]!.counters.rope ?? 0) === 1);
  expect(after.objects[line]!.zone).toBe("battlefield");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Fraying Line: at your upkeep, don't pay: it and each creature without a rope counter are exiled", async ({ page }) => {
  let s = scene({ hand: ["Fraying Line"], board: [...LANDS, "Grizzly Bears", "Gray Ogre"] }, [{ board: ["Serra Angel"] }]);
  const [line, bears, ogre, angel] = [one(s, "Fraying Line"), one(s, "Grizzly Bears"), one(s, "Gray Ogre"), one(s, "Serra Angel")];
  s = playUntil(s, (st) => st.activePlayer === 3 && st.step === "end" && !st.pending);
  const p = s.players[0]!;
  p.hand.splice(p.hand.indexOf(line), 1);
  s.objects[line]!.zone = "battlefield";
  s.battlefield.push(line);
  s.objects[bears]!.counters = { rope: 1 };
  invalidateCharacteristics(s);
  s = playUntil(s, (st) => st.activePlayer === 0 && st.step === "upkeep" && st.pending?.kind === "chooseOption" && st.pending.what === "punisher" && st.pending.player === 0);
  const at: GameState = s;
  await open(page, at);
  await controls(page).getByRole("button", { name: "Don't" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[line]!.zone === "exile");
  expect([after.objects[ogre]!.zone, after.objects[angel]!.zone, after.objects[bears]!.zone]).toEqual(["exile", "exile", "battlefield"]);
  expect(after.objects[bears]!.counters.rope ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Meandering Towershell: back tapped and attacking at your next declare attackers step, attacking whom you pick", async ({ page }) => {
  let s = scene({ board: ["Meandering Towershell"] });
  const shell = one(s, "Meandering Towershell");
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: shell, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "attackWhom" && st.pending.player === 0);
  const at: GameState = s;
  expect(at.objects[shell]!.zone).toBe("exile");
  expect(at.activePlayer).toBe(0);
  await open(page, at);
  const bar = controls(page);
  await expect(bar).toContainText("Meandering Towershell");
  await bar.getByRole("button", { name: "Ben" }).click();
  const after = await resolveUntil(page, (st) => st.objects[shell]!.zone === "battlefield" && st.objects[shell]!.attacking === 2);
  expect(after.objects[shell]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
