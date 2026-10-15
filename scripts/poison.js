// Sylvie's Senses — poisons.
// When the Poisoned condition lands on a creature, the GM is asked for the poison's name, saving throw, duration,
// whether a successful save ends it and whether it is secret. Secret poisons keep working (the condition is real:
// disadvantage, immunities, Lesser Restoration) but players don't see the icon or the effect; the GM does.
// Saves: in combat at the start of each of the creature's turns; out of combat every few minutes of world time
// (not for 1-minute poisons). The owner gets a popup and rolls; a success removes the poison.

import { MODULE_ID, getF, setF, setting } from "./settings.js";
import { isActiveGM, onSocket, sendTo } from "./socket.js";

export const DURATIONS = {
  turnEnd: "Até o fim do próximo turno da criatura",
  turnStart: "Até o começo do próximo turno da criatura",
  min1: "1 minuto",
  min10: "10 minutos",
  hours: "Horas",
  days: "Dias",
  keep: "Manter a duração atual do efeito"
};
const TURN_MODES = new Set(["turnEnd", "turnStart"]);

export const poisonOf = effect => getF(effect, "poison") ?? null;
export const isSecret = effect => !!poisonOf(effect)?.secret;
const poisonEffects = actor => actor?.effects?.filter(e => poisonOf(e)) ?? [];
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/* -------------------------------------------- */
/*  Asking the GM                               */
/* -------------------------------------------- */

function defaultDC(effect) {
  const origin = effect.origin ? fromUuidSync(effect.origin, { strict: false }) : null;
  for (const activity of origin?.system?.activities ?? []) {
    const dc = Number(activity.save?.dc?.value);
    if (dc) return dc;
  }
  return 12;
}

export async function configurePoison(effect) {
  const actor = effect.parent;
  const p = poisonOf(effect) ?? {};
  const abilities = Object.entries(CONFIG.DND5E.abilities).map(([k, a]) =>
    `<option value="${k}" ${k === (p.ability ?? "con") ? "selected" : ""}>${esc(a.label)}</option>`).join("");
  const modes = Object.entries(DURATIONS).map(([k, label]) =>
    `<option value="${k}" ${k === (p.mode ?? "min1") ? "selected" : ""}>${esc(label)}</option>`).join("");
  const content = `
    <div class="sylvies-senses-form">
      <p><strong>${esc(actor.name)}</strong> ficou envenenado.</p>
      <div class="form-group"><label>Nome do veneno</label>
        <input type="text" name="name" value="${esc(p.name ?? "")}" placeholder="opcional (aparece no Detect Poison)"></div>
      <div class="form-group"><label>Teste</label>
        <select name="ability">${abilities}</select>
        <span>CD</span><input type="number" name="dc" value="${p.dc ?? defaultDC(effect)}" min="1" max="40"></div>
      <div class="form-group"><label>Duração</label>
        <select name="mode">${modes}</select>
        <input type="number" name="amount" value="${p.amount ?? 1}" min="1" title="Quantidade (horas ou dias)"></div>
      <div class="form-group"><label class="checkbox"><input type="checkbox" name="saveEnds" ${p.saveEnds === false ? "" : "checked"}>
        Termina ao passar no teste</label></div>
      <p class="hint">Desligado: só acaba com o tempo ou com magia (ex.: Lesser Restoration).</p>
      <div class="form-group"><label class="checkbox"><input type="checkbox" name="secret" ${p.secret ? "checked" : ""}>
        Secreto (o jogador não vê o ícone nem o nome)</label></div>
    </div>`;
  const data = await foundry.applications.api.DialogV2.wait({
    window: { title: "Veneno", icon: "fa-solid fa-flask" },
    content,
    buttons: [
      { action: "apply", label: "Aplicar", icon: "fa-solid fa-check", default: true,
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
      { action: "ignore", label: "Deixar como está", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!data || typeof data !== "object") return;
  await applyPoison(effect, data);
}

async function applyPoison(effect, data) {
  if (!effect.parent?.effects?.get(effect.id)) return; // removed meanwhile
  const now = game.time.worldTime;
  const combat = combatOf(effect.parent);
  const mode = data.mode;
  const amount = Math.max(1, Number(data.amount) || 1);
  const name = String(data.name ?? "").trim();
  const flags = {
    name, mode, amount,
    dc: Number(data.dc) || 12,
    ability: data.ability || "con",
    saveEnds: !!data.saveEnds,
    secret: !!data.secret,
    appliedAt: now,
    nextCheck: now + intervalSeconds(),
    applied: combat ? { combat: combat.id, round: combat.round, turn: combat.turn } : null
  };
  const update = { [`flags.${MODULE_ID}.poison`]: flags };
  const seconds = { min1: 60, min10: 600, hours: amount * 3600, days: amount * 86400 }[mode];
  if (seconds) Object.assign(update, { "duration.seconds": seconds, "duration.startTime": now, "duration.rounds": null, "duration.turns": null });
  if (TURN_MODES.has(mode)) Object.assign(update, { "duration.seconds": null, "duration.rounds": null, "duration.turns": null });
  update.name = `Poisoned${name ? ` — ${name}` : ""}${flags.secret ? " (secreto)" : ""}`;
  await effect.update(update);
}

const intervalSeconds = () => Math.max(1, Number(setting("poisonInterval")) || 10) * 60;

/* -------------------------------------------- */
/*  Combat and time                             */
/* -------------------------------------------- */

function combatOf(actor) {
  return game.combats.find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor?.uuid)) ?? null;
}

/** Was the poison applied before this (round, turn) of this combat? */
function appliedBefore(p, combat, at) {
  if (!p.applied || p.applied.combat !== combat.id) return true;
  return p.applied.round < at.round || (p.applied.round === at.round && p.applied.turn < at.turn);
}

async function onTurnChange(combat, prior, current) {
  if (!isActiveGM()) return;
  const ended = combat.combatants.get(prior?.combatantId)?.actor;
  for (const effect of poisonEffects(ended)) {
    const p = poisonOf(effect);
    if (p.mode === "turnEnd" && appliedBefore(p, combat, prior)) await effect.delete();
  }
  const started = combat.combatants.get(current?.combatantId)?.actor;
  for (const effect of poisonEffects(started)) {
    const p = poisonOf(effect);
    if (p.mode === "turnStart") {
      if (appliedBefore(p, combat, current)) await effect.delete();
      continue;
    }
    if (p.saveEnds && !TURN_MODES.has(p.mode)) askSave(started, effect);
  }
}

function poisonedActors() {
  const seen = new Map();
  const add = a => { if (a && poisonEffects(a).length) seen.set(a.uuid, a); };
  game.actors.forEach(add);
  for (const scene of game.scenes) for (const t of scene.tokens) if (!t.actorLink) add(t.actor);
  return [...seen.values()];
}

async function onWorldTime(worldTime) {
  if (!isActiveGM()) return;
  const timesUp = game.modules.get("times-up")?.active;
  for (const actor of poisonedActors()) {
    const fighting = !!combatOf(actor);
    for (const effect of poisonEffects(actor)) {
      const p = poisonOf(effect);
      if (TURN_MODES.has(p.mode)) {
        if (!fighting && worldTime >= p.appliedAt + 6) await effect.delete();
        continue;
      }
      if (!timesUp && effect.duration.seconds && effect.duration.remaining <= 0) { await effect.delete(); continue; }
      if (fighting || !p.saveEnds || p.mode === "min1") continue;
      if (worldTime < p.nextCheck) continue;
      await setF(effect, "poison.nextCheck", worldTime + intervalSeconds());
      askSave(actor, effect);
    }
  }
}

/* -------------------------------------------- */
/*  The save                                    */
/* -------------------------------------------- */

/** Who rolls: an online player who owns the creature (their own character first), else the GM. */
function roller(actor) {
  const players = game.users.filter(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"));
  return (players.find(u => u.character?.id === actor.id) ?? players[0] ?? game.users.activeGM)?.id;
}

function askSave(actor, effect) {
  const p = poisonOf(effect);
  const userId = roller(actor);
  if (!userId) return;
  sendTo(userId, "save", { actorUuid: actor.uuid, effectId: effect.id, dc: p.dc, ability: p.ability, secret: p.secret, name: p.name });
}

async function promptSave({ actorUuid, effectId, dc, ability, secret, name }) {
  const actor = fromUuidSync(actorUuid);
  if (!actor?.effects.get(effectId)) return;
  const abl = CONFIG.DND5E.abilities[ability]?.label ?? ability;
  const content = secret
    ? `<p><strong>${esc(actor.name)}</strong> não se sente muito bem: tontura, enjoo, o corpo pesado.</p>
       <p>Role um teste de resistência de <strong>${esc(abl)}</strong> para se manter firme.</p>`
    : `<p><strong>${esc(actor.name)}</strong> está envenenado${name ? ` (${esc(name)})` : ""}.</p>
       <p>Role um teste de resistência de <strong>${esc(abl)}</strong>, CD ${dc}.</p>`;
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: secret ? "Algo não está certo" : "Veneno", icon: "fa-solid fa-face-dizzy" },
    content,
    buttons: [{ action: "roll", label: `Rolar ${abl}`, icon: "fa-solid fa-dice-d20", default: true }],
    rejectClose: false
  });
  if (choice !== "roll") return;
  const rolls = await actor.rollSavingThrow({ ability, target: dc });
  const roll = Array.isArray(rolls) ? rolls[0] : rolls;
  if (!roll) return;
  const success = roll.isSuccess ?? roll.total >= dc;
  if (!success) return;
  await actor.effects.get(effectId)?.delete();
  if (secret) ui.notifications.info(`${actor.name} se sente melhor.`);
}

/* -------------------------------------------- */
/*  Hiding secret poisons from players          */
/* -------------------------------------------- */

/** Token icons come from Actor#temporaryEffects: leave secret poisons out on player clients. */
export function registerSecrecy() {
  const proto = CONFIG.Actor.documentClass.prototype;
  let p = proto;
  let desc;
  while (p && !(desc = Object.getOwnPropertyDescriptor(p, "temporaryEffects"))) p = Object.getPrototypeOf(p);
  if (!desc?.get) return console.warn(`${MODULE_ID} | Actor#temporaryEffects not found: secret poisons will show their icon.`);
  Object.defineProperty(proto, "temporaryEffects", {
    configurable: true,
    get() {
      const list = desc.get.call(this);
      return game.user?.isGM ? list : list.filter(e => !isSecret(e));
    }
  });
}

/** Does the creature look poisoned to this player (an open, non-secret Poisoned)? */
const visiblyPoisoned = actor => actor.effects.some(e => e.statuses.has("poisoned") && !isSecret(e));

function hideOnSheet(app, html) {
  if (game.user.isGM) return;
  const actor = app.document ?? app.actor;
  if (!(actor instanceof Actor)) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  for (const effect of actor.effects.filter(isSecret)) {
    root.querySelectorAll(`[data-effect-id="${effect.id}"], [data-id="${effect.id}"], [data-item-id="${effect.id}"]`).forEach(el => el.remove());
  }
  if (actor.effects.some(isSecret) && !visiblyPoisoned(actor)) {
    root.querySelectorAll('[data-condition-id="poisoned"], [data-status-id="poisoned"], [data-effect-id="dnd5epoisoned000"]').forEach(el => {
      el.classList.remove("active");
      el.querySelector("input[type=checkbox]")?.removeAttribute("checked");
      const cb = el.querySelector("input[type=checkbox]");
      if (cb) cb.checked = false;
    });
  }
}

function hideOnHUD(hud, html) {
  if (game.user.isGM) return;
  const actor = hud.object?.actor;
  if (!actor?.effects.some(isSecret) || visiblyPoisoned(actor)) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  root?.querySelectorAll('[data-status-id="poisoned"]').forEach(el => el.classList.remove("active"));
}

/* -------------------------------------------- */

export function registerPoison() {
  onSocket("save", data => promptSave(data).catch(err => console.error(`${MODULE_ID} |`, err)));
  Hooks.on("createActiveEffect", (effect, options) => {
    if (!isActiveGM() || !setting("poisonPrompt") || options?.[MODULE_ID]?.skip) return;
    if (!effect.statuses?.has("poisoned") || poisonOf(effect) || !(effect.parent instanceof Actor)) return;
    if (effect.parent.system?.traits?.ci?.value?.has?.("poisoned")) return; // immune: the system removes it
    configurePoison(effect).catch(err => console.error(`${MODULE_ID} |`, err));
  });
  Hooks.on("combatTurnChange", (combat, prior, current) => { onTurnChange(combat, prior, current).catch(err => console.error(`${MODULE_ID} |`, err)); });
  Hooks.on("updateWorldTime", worldTime => { onWorldTime(worldTime).catch(err => console.error(`${MODULE_ID} |`, err)); });
  Hooks.on("renderApplicationV2", hideOnSheet);
  Hooks.on("renderActorSheet", hideOnSheet);
  Hooks.on("renderTokenHUD", hideOnHUD);
}
