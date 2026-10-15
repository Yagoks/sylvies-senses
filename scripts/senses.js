// Sylvie's Senses — the detection engine.
// A creature "senses" while it has an active effect flagged with a sense ("evil-good", "magic", "poison"), created when
// it casts one of the detection spells. Each client draws, for its own casters only, a local JB2A aura on every token or
// tile within range that the sense finds, unless a wall (sight) stands between them or the target is shielded by lead.
// Hovering a marked target shows what was sensed; clicking an unexamined magic aura spends the Magic action.

import { MODULE_ID, getF, setF, setting } from "./settings.js";
import { FILES, findings, noteOf } from "./sources.js";

export const SENSES = {
  "detect-evil-and-good": "evil-good",
  "detect-magic": "magic",
  "detect-poison-and-disease": "poison"
};
const SENSE_NAMES = { "evil-good": "Detect Evil and Good", magic: "Detect Magic", poison: "Detect Poison and Disease" };

const shown = new Map(); // effect name -> { file, label, placeable, isTile, sense, unrevealed }
let tooltip = null;
let hovered = null;

/* -------------------------------------------- */
/*  Casting                                     */
/* -------------------------------------------- */

const durationSeconds = d => {
  const v = Number(d?.value) || 0;
  return ({ minute: 60, hour: 3600, day: 86400, round: 6, turn: 6 })[d?.units] * v || 600;
};

/** The spell was cast: give the caster the sense, tied to concentration. */
export async function onUse(activity) {
  const item = activity?.item;
  const actor = item?.actor;
  const sense = getF(item, "sense") ?? SENSES[item?.system?.identifier];
  if (!sense || !actor?.isOwner) return;
  const concOf = e => e.statuses.has("concentrating") && (e.getFlag("dnd5e", "item")?.id === item.id || e.origin === item.uuid);
  // Recast: the previous casting (its sense and its concentration) ends.
  const oldConc = new Set(actor.effects.filter(concOf).map(e => e.id));
  const old = actor.effects.filter(e => getF(e, "sense") === sense);
  if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old.map(e => e.id).filter(id => actor.effects.has(id)));
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: item.name, img: item.img, origin: item.uuid, transfer: false,
    duration: { seconds: durationSeconds(item.system.duration), startTime: game.time.worldTime },
    flags: { [MODULE_ID]: { sense, range: 30, revealed: false } }
  }]);
  if (!effect) return;
  // Never two senses of the same kind (a hook fired twice, a double click).
  const dupes = actor.effects.filter(e => getF(e, "sense") === sense && e.id !== effect.id).map(e => e.id);
  if (dupes.length) await actor.deleteEmbeddedDocuments("ActiveEffect", dupes);
  if (!item.system.properties?.has("concentration")) return;
  // Tie it to the new concentration effect so losing concentration ends the sense.
  for (let i = 0; i < 10; i++) {
    const conc = actor.effects.find(e => concOf(e) && !oldConc.has(e.id));
    if (conc) {
      const stale = [...oldConc].filter(id => actor.effects.has(id));
      if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
      return conc.addDependent(effect);
    }
    await new Promise(r => setTimeout(r, 300));
  }
}

/* -------------------------------------------- */
/*  Who senses on this client                   */
/* -------------------------------------------- */

function mySensors() {
  const out = [];
  if (!canvas.ready) return out;
  for (const token of canvas.tokens.placeables) {
    const actor = token.actor;
    if (!actor?.isOwner) continue;
    if (game.user.isGM && actor.hasPlayerOwner && !setting("gmSees")) continue;
    for (const effect of actor.effects) {
      const sense = getF(effect, "sense");
      if (!sense || effect.disabled || effect.isSuppressed) continue;
      out.push({ token, actor, effect, sense, range: Number(getF(effect, "range")) || 30, revealed: !!getF(effect, "revealed") });
    }
  }
  return out;
}

/* -------------------------------------------- */
/*  Range and blocking                          */
/* -------------------------------------------- */

const blocked = (a, b) => CONFIG.Canvas.polygonBackends.sight.testCollision(a, b, { type: "sight", mode: "any" });

function inReach(sensor, placeable) {
  const from = sensor.token.center;
  const to = placeable.center;
  const radius = Math.max(0, (Math.min(placeable.bounds.width, placeable.bounds.height) - canvas.grid.size) / 2);
  const dist = Math.hypot(to.x - from.x, to.y - from.y) - radius;
  if (dist > sensor.range * canvas.dimensions.distancePixels) return false;
  return !blocked(from, to);
}

/* -------------------------------------------- */
/*  Compute and draw                            */
/* -------------------------------------------- */

function compute() {
  const want = new Map();
  const sensors = mySensors();
  if (!sensors.length) return want;
  const targets = [
    ...canvas.tokens.placeables.filter(t => t.actor && (!t.document.hidden || game.user.isGM)).map(p => [p, false]),
    ...canvas.tiles.placeables.filter(t => noteOf(t.document).kind && (!t.document.hidden || game.user.isGM)).map(p => [p, true])
  ];
  for (const sensor of sensors) {
    for (const [placeable, isTile] of targets) {
      if (placeable === sensor.token) continue;
      if (noteOf(placeable.document).shielded) continue;
      const found = findings(sensor.sense, placeable, isTile, sensor.revealed);
      if (!found.length || !inReach(sensor, placeable)) continue;
      const f = found[0];
      const name = `${MODULE_ID}.${sensor.sense}.${placeable.document.id}`;
      want.set(name, { file: FILES[f.style] ?? FILES.magic, label: f.label, placeable, isTile, sense: sensor.sense, unrevealed: !!f.unrevealed, sensor });
    }
  }
  return want;
}

function play(name, entry) {
  const scale = entry.isTile ? 1 : 1.35;
  new Sequence()
    .effect()
    .file(entry.file)
    .attachTo(entry.placeable, { bindVisibility: false, bindAlpha: false })
    .scaleToObject(scale)
    .opacity(Number(setting("opacity")) || 0.15)
    .persist()
    .fadeIn(500)
    .fadeOut(500)
    .locally()
    .name(name)
    .play();
}

const stop = name => Sequencer.EffectManager.endEffects({ name });

export function refresh() {
  const want = compute();
  for (const [name, old] of shown) {
    const next = want.get(name);
    if (!next || next.file !== old.file || next.placeable !== old.placeable) { stop(name); shown.delete(name); }
  }
  for (const [name, entry] of want) {
    if (!shown.has(name)) play(name, entry);
    shown.set(name, entry);
  }
  if (hovered && ![...shown.values()].some(e => e.placeable === hovered)) hideTooltip();
}

let pending = false;
export function schedule() {
  if (pending) return;
  pending = true;
  setTimeout(() => { pending = false; try { refresh(); } catch (err) { console.error(`${MODULE_ID} |`, err); } }, 120);
}

/* -------------------------------------------- */
/*  Tooltip and examining auras                 */
/* -------------------------------------------- */

function hideTooltip() {
  hovered = null;
  tooltip?.remove();
  tooltip = null;
}

function entriesAt(point) {
  return [...shown.values()].filter(e => e.placeable.bounds?.contains(point.x, point.y));
}

function onPointerMove(event) {
  if (!shown.size || !canvas.ready) return hideTooltip();
  const point = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
  const here = entriesAt(point);
  if (!here.length) return hideTooltip();
  hovered = here[0].placeable;
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "sylvies-senses-tooltip";
    document.body.append(tooltip);
  }
  const lines = here.filter(e => e.placeable === hovered).map(e => e.label + (e.unrevealed ? "\n(clique para examinar: ação Magia)" : ""));
  tooltip.innerText = lines.join("\n");
  tooltip.style.left = `${event.clientX + 16}px`;
  tooltip.style.top = `${event.clientY + 12}px`;
}

async function onPointerDown(event) {
  if (event.button !== 0 || !shown.size || !canvas.ready) return;
  const point = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
  const target = entriesAt(point).find(e => e.unrevealed);
  if (!target) return;
  const sensor = target.sensor;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Detect Magic" },
    content: `<p>Usar a ação <strong>Magia</strong> de <strong>${foundry.utils.escapeHTML(sensor.actor.name)}</strong> para examinar as auras?</p><p>Você vê a escola de magia de todas as auras visíveis no alcance.</p>`,
    yes: { label: "Examinar", icon: "fa-solid fa-eye" },
    no: { label: "Cancelar", icon: "fa-solid fa-xmark" },
    rejectClose: false
  });
  if (!ok) return;
  await setF(sensor.effect, "revealed", true);
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: sensor.actor }),
    content: `<p><em>${foundry.utils.escapeHTML(sensor.actor.name)} usa a ação Magia para examinar as auras mágicas.</em></p>`
  });
  if (game.combat?.started && game.combat.combatant?.actor === sensor.actor) globalThis.MidiQOL?.setActionUsed?.(sensor.actor);
}

/* -------------------------------------------- */

export function registerSenses() {
  Hooks.on("dnd5e.postUseActivity", activity => { onUse(activity).catch(err => console.error(`${MODULE_ID} |`, err)); });
  for (const hook of ["refreshToken", "createToken", "deleteToken", "updateToken", "createTile", "updateTile", "deleteTile",
    "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "createItem", "updateItem", "deleteItem", "updateActor",
    "createWall", "updateWall", "deleteWall", "sightRefresh"]) Hooks.on(hook, schedule);
  Hooks.on("canvasTearDown", () => { shown.clear(); hideTooltip(); });
  const attach = () => {
    const v = canvas.app?.view;
    if (!v || v._sylviesSenses) return;
    v._sylviesSenses = true;
    v.addEventListener("pointermove", onPointerMove);
    v.addEventListener("pointerleave", hideTooltip);
    v.addEventListener("pointerdown", onPointerDown);
  };
  Hooks.on("canvasReady", () => { shown.clear(); attach(); schedule(); });
  if (canvas.ready) { attach(); schedule(); }
}

export const senseName = s => SENSE_NAMES[s] ?? s;
