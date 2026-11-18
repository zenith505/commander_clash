// Round 415 in the browser: Radiate on Ana's Lightning Bolt (you click the Bolt, then each copy's player or permanent),
// Radiant Performer flashed in against Ana's Prodigal Pyromancer ability, Agrus Kos paying {1}{R/W} when Ana's Pyromancer
// targets it, Exterminator Magmarch's copy of your Murder at the permanent you click, and Mischievous Quanar turned face
// up (its copy of Ana's Bolt given a new target, Ana).
import { expect, test, type Page } from "@playwright/test";
import { applyAction, invalidateCharacteristics, planActivate, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

const MOUNTAINS = ["Mountain", "Mountain", "Mountain"];

/** Ana's main phase with her priority and an empty stack. */
const anaMain = (s: GameState) => playUntil(s, (x) => x.activePlayer === 1 && x.step === "main1" && x.priority === 1 && x.stack.length === 0 && !x.pending);

/** Click the first button of each "which one does the next copy target" prompt until there's none. */
async function orderCopies(page: Page) {
  for (let i = 0; i < 12; i++) {
    const st = await resolveUntil(page, (x) => (x.pending?.kind === "chooseOption" && x.pending.what === "copyOrder" && x.pending.player === 0) || (!x.pending && x.stack.length === 0));
    if (st.pending?.kind !== "chooseOption") return st;
    await controls(page).getByRole("button").first().click();
  }
  throw new Error("too many copy prompts");
}

test("Radiate: Ana bolts you; you click Radiate, then her Bolt, then the player or permanent each copy targets", async ({ page }) => {
  const s0 = scene({ hand: ["Radiate"], board: [...LANDS, "Grizzly Bears"] }, [{ hand: ["Lightning Bolt"], board: [...MOUNTAINS, "Hill Giant"] }]);
  const [bears, giant, bolt, radiate] = [one(s0, "Grizzly Bears"), one(s0, "Hill Giant"), one(s0, "Lightning Bolt"), one(s0, "Radiate")];
  let s = anaMain(s0);
  for (const a of planCast(s, 1, bolt, [{ kind: "player", id: 0 }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.priority === 0 && x.stack.length === 1 && !x.pending);
  const boltItem = s.stack[0]!.id;
  await open(page, s);
  await card(page, "Radiate", s).click();
  await page.locator(`[data-stack="${boltItem}"]`).first().click();
  const order = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "copyOrder" && x.pending.player === 0);
  expect(order.pending).toMatchObject({ options: expect.arrayContaining(["p1", "p2", "p3", bears, giant]) });
  expect((order.pending as { options: string[] }).options).not.toContain("p0");
  const bar = controls(page);
  await expect(bar).toContainText("choose the permanent or player the next copy of Lightning Bolt targets");
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "copyOrder" && (x.pending as { options: string[] }).options.length === 4);
  await bar.getByRole("button", { name: "Hill Giant (Ana)", exact: true }).click();
  const after = await orderCopies(page);
  for (const p of [0, 1, 2, 3]) expect(after.players[p]!.life).toBe(37);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.objects[radiate]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Radiant Performer: flashed in against Ana's Prodigal Pyromancer pinging Ben, it copies the ability at everyone else", async ({ page }) => {
  const s0 = scene({ hand: ["Radiant Performer"], board: LANDS }, [{ board: ["Prodigal Pyromancer"] }]);
  const [pyro, perf] = [one(s0, "Prodigal Pyromancer"), one(s0, "Radiant Performer")];
  let s = anaMain(s0);
  for (const a of planActivate(s, 1, pyro, 0, [{ kind: "player", id: 2 }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.priority === 0 && x.stack.length === 1 && !x.pending);
  const ping = s.stack[0]!.id;
  await open(page, s);
  await card(page, "Radiant Performer", s).click();
  const st = await resolveUntil(page, (x) => (x.pending?.kind === "chooseTargets" && x.pending.player === 0) || (x.pending?.kind === "chooseOption" && x.pending.what === "copyOrder"));
  if (st.pending?.kind === "chooseTargets") await page.locator(`[data-stack="${ping}"]`).first().click();
  const order = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "copyOrder" && x.pending.player === 0);
  expect(order.pending).toMatchObject({ options: expect.arrayContaining(["p0", "p1", "p3", pyro, perf]) });
  expect(order.stack.filter((x) => x.copy && x.kind === "ability").length).toBe(0);
  const after = await orderCopies(page);
  for (const p of [0, 1, 2, 3]) expect(after.players[p]!.life).toBe(39);
  expect(after.log.some((e) => e.text.startsWith("You copies Prodigal Pyromancer") || e.text.startsWith("You copy Prodigal Pyromancer"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Agrus Kos: Ana's Prodigal Pyromancer targets Agrus Kos; you pay {1}{R/W} and the ability is copied at your other creature", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Agrus Kos, Eternal Soldier", "Grizzly Bears"] }, [{ board: ["Prodigal Pyromancer"] }]);
  const [pyro, agrus, bears] = [one(s0, "Prodigal Pyromancer"), one(s0, "Agrus Kos, Eternal Soldier"), one(s0, "Grizzly Bears")];
  let s = anaMain(s0);
  for (const a of planActivate(s, 1, pyro, 0, [{ kind: "object", id: agrus }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "chooseMay" && x.pending.player === 0);
  expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{1}{R/W}" } });
  await open(page, s);
  await expect(controls(page)).toContainText("Agrus Kos");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && (x.objects[bears]!.damage ?? 0) === 1);
  expect(after.objects[agrus]!.damage ?? 0).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Exterminator Magmarch: your Murder at Ana's Hill Giant is copied at the permanent another opponent controls that you click", async ({ page }) => {
  const s = scene({ hand: ["Murder"], board: [...LANDS, "Exterminator Magmarch"] }, [{ board: ["Hill Giant", "Grizzly Bears"] }, { board: ["Serra Angel"] }, { board: ["Ornithopter"] }]);
  const [giant, anaBears, angel, bird] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Serra Angel"), one(s, "Ornithopter")];
  await open(page, s);
  await card(page, "Murder", s).click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const choose = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "copyOrder" && x.pending.player === 0);
  expect((choose.pending as { options: string[] }).options.sort()).toEqual([angel, bird].sort());
  const bar = controls(page);
  await expect(bar).toContainText("choose the permanent the copy of Murder targets");
  await bar.getByRole("button", { name: "Serra Angel", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[angel]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.objects[anaBears]!.zone).toBe("battlefield");
  expect(after.objects[bird]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Mischievous Quanar: Ana bolts you; you turn Quanar face up, and its copy of the Bolt gets a new target, Ana", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Mischievous Quanar"] }, [{ hand: ["Lightning Bolt"], board: MOUNTAINS }]);
  const [quanar, bolt] = [one(s0, "Mischievous Quanar"), one(s0, "Lightning Bolt")];
  s0.objects[quanar]!.faceDown = "morph";
  invalidateCharacteristics(s0);
  let s = anaMain(s0);
  for (const a of planCast(s, 1, bolt, [{ kind: "player", id: 0 }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.priority === 0 && x.stack.length === 1 && !x.pending);
  const boltItem = s.stack[0]!.id;
  await open(page, s);
  await page.locator(`[data-obj="${quanar}"]`).first().click();
  await menu(page).getByRole("button", { name: /Turn face up: morph/ }).click();
  // Its trigger's target, chosen as it's put on the stack: Ana's Bolt.
  await resolveUntil(page, (x) => x.pending?.kind === "chooseTargets" && x.pending.player === 0);
  await expect(page.locator(".targeting")).toContainText("choose target instant or sorcery spell");
  await page.locator(`[data-stack="${boltItem}"]`).first().click();
  await resolveUntil(page, (x) => x.pending?.kind === "copyTargets" && x.pending.player === 0);
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.players[1]!.life === 37);
  expect(after.players[0]!.life).toBe(37);
  expect(after.objects[quanar]!.faceDown).toBeFalsy();
  expect(pageErrors(page)).toEqual([]);
});
