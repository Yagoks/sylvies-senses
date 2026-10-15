// Sylvie's Senses — what each sense finds on a token or a tile.
// A finding is { style, label } where style picks the animation (see FILES) and label is the tooltip line.

import { MODULE_ID, getF } from "./settings.js";

/** The GM note of a token or tile: { kind, school, name, text, shielded, trueType }. */
export const noteOf = doc => getF(doc, "note") ?? {};

/* -------------------------------------------- */
/*  Hidden from divination                      */
/* -------------------------------------------- */

const BLOCKERS = /proof against detection|nondetection/i;

/** Worn and attuned (when it needs attunement). */
const worn = item => (item.system.equipped ?? true) && (item.system.attunement === "required" ? !!item.system.attuned : true);

/**
 * Nothing is detected on this target: the GM marked it shielded (lead, thick stone), or the creature is hidden from
 * divination (Amulet of Proof against Detection and Location, Nondetection, or anything flagged blocksDetection).
 */
export function isShielded(placeable, isTile) {
  const doc = placeable.document;
  if (noteOf(doc).shielded) return true;
  if (isTile) return false;
  const actor = doc.actor;
  if (!actor) return false;
  for (const item of actor.items) {
    if (item.type === "spell") continue;
    const blocks = getF(item, "blocksDetection") || BLOCKERS.test(item.name) || BLOCKERS.test(item.system.identifier?.replace(/-/g, " ") ?? "");
    if (blocks && worn(item)) return true;
  }
  for (const effect of actor.appliedEffects ?? []) {
    if (getF(effect, "blocksDetection") || BLOCKERS.test(effect.name)) return true;
    const origin = effect.origin ? fromUuidSync(effect.origin, { strict: false }) : null;
    if (origin?.type === "spell" && BLOCKERS.test(origin.name)) return true;
  }
  return false;
}

/* -------------------------------------------- */
/*  Animations                                  */
/* -------------------------------------------- */

const SCHOOL_KEYS = { abj: "abjuration", con: "conjuration", div: "divination", enc: "enchantment", evo: "evocation", ill: "illusion", nec: "necromancy", trs: "transmutation" };
const SCHOOL_COLORS = { abjuration: "blue", conjuration: "yellow", divination: "grey", enchantment: "pink", evocation: "red", illusion: "purple", necromancy: "green", transmutation: "orange" };

export const FILES = {
  aberration: "jb2a.magic_signs.rune.02.loop.08.grey",
  fiend: "jb2a.magic_signs.rune.02.loop.07.red",
  undead: "jb2a.magic_signs.rune.02.loop.05.green",
  celestial: "jb2a.magic_signs.rune.02.loop.01.yellow",
  fey: "jb2a.magic_signs.rune.02.loop.06.purple",
  elemental: "jb2a.magic_signs.rune.02.loop.03.blue",
  consecrated: "jb2a.magic_signs.rune.02.loop.01.yellow",
  desecrated: "jb2a.magic_signs.rune.02.loop.07.red",
  magic: "jb2a.magic_signs.rune.02.loop.02.blue",
  poison: "jb2a.markers.poison.dark_green.02",
  disease: "jb2a.markers.poison.purple"
};
for (const [school, color] of Object.entries(SCHOOL_COLORS)) FILES[school] = `jb2a.magic_signs.rune.${school}.loop.${color}`;

/** Accepts "ill" or "illusion"; returns the long key or null. */
export const schoolKey = s => (s && (SCHOOL_KEYS[s] ?? (Object.values(SCHOOL_KEYS).includes(s) ? s : null))) || null;
export const schoolLabel = s => {
  const short = Object.entries(SCHOOL_KEYS).find(([, long]) => long === s)?.[0];
  return CONFIG.DND5E.spellSchools[short]?.label ?? s;
};

/* -------------------------------------------- */
/*  Detect Evil and Good                        */
/* -------------------------------------------- */

export const EVIL_GOOD = ["aberration", "celestial", "elemental", "fey", "fiend", "undead"];

/** A creature turned into another with the system's Transform: { original actor, preset }, else null. */
function transformOf(actor) {
  const f = actor?.flags?.dnd5e;
  if (!f?.isPolymorphed) return null;
  return { original: game.actors.get(f.originalActor) ?? null, preset: f.transformOptions?.preset ?? "" };
}
// Polymorph and Wild Shape really change the creature type; any other transformation is a disguise.
const TRUE_CHANGE = new Set(["polymorph", "polymorphSelf", "wildshape"]);

function creatureType(td) {
  const note = noteOf(td);
  if (note.trueType) return note.trueType;
  const tf = transformOf(td.actor);
  if (tf?.original && !TRUE_CHANGE.has(tf.preset)) return tf.original.system?.details?.type?.value ?? null;
  return td.actor?.system?.details?.type?.value ?? null;
}

function findEvilGood(placeable, isTile) {
  const doc = placeable.document;
  const note = noteOf(doc);
  const out = [];
  if (note.kind === "consecrated") out.push({ style: "consecrated", label: "Consagrado" + (note.text ? ` — ${note.text}` : "") });
  if (note.kind === "desecrated") out.push({ style: "desecrated", label: "Profanado" + (note.text ? ` — ${note.text}` : "") });
  if (!isTile) {
    const type = creatureType(doc);
    if (EVIL_GOOD.includes(type)) out.push({ style: type, label: CONFIG.DND5E.creatureTypes[type]?.label ?? type });
  }
  return out.slice(0, 1);
}

/* -------------------------------------------- */
/*  Detect Magic                                */
/* -------------------------------------------- */

const PHYSICAL = new Set(["weapon", "equipment", "consumable", "tool", "loot", "container"]);

/** Magic on a token or tile: [{ school|null, what }]. */
export function magicOf(placeable, isTile) {
  const doc = placeable.document;
  const note = noteOf(doc);
  const out = [];
  if (note.kind === "magic") out.push({ school: schoolKey(note.school), what: note.text || "objeto" });
  if (isTile) return out;
  const actor = doc.actor;
  if (!actor) return out;
  const tf = transformOf(actor);
  if (tf) out.push({ school: TRUE_CHANGE.has(tf.preset) ? "transmutation" : "illusion", what: "transformação" });
  for (const effect of actor.appliedEffects ?? []) {
    if (getF(effect, "poison")) continue;
    const origin = effect.origin ? fromUuidSync(effect.origin, { strict: false }) : null;
    if (origin?.type === "spell") out.push({ school: schoolKey(origin.system.school), what: origin.name });
  }
  for (const item of actor.items) {
    if (!PHYSICAL.has(item.type) || !item.system.properties?.has?.("mgc")) continue;
    out.push({ school: null, what: item.name });
  }
  return out;
}

function findMagic(placeable, isTile, revealed) {
  const magic = magicOf(placeable, isTile);
  if (!magic.length) return [];
  if (!revealed) return [{ style: "magic", label: "Aura mágica", unrevealed: true }];
  const schools = [...new Set(magic.map(m => m.school).filter(Boolean))];
  const parts = schools.map(schoolLabel);
  if (magic.some(m => !m.school)) parts.push("magia sem escola definida");
  const noteText = isTile && noteOf(placeable.document).text ? ` (${noteOf(placeable.document).text})` : "";
  return [{ style: schools[0] ?? "magic", label: `Aura mágica — ${parts.join(", ")}${noteText}` }];
}

/* -------------------------------------------- */
/*  Detect Poison and Disease                   */
/* -------------------------------------------- */

function dealsPoison(item) {
  for (const activity of item.system.activities ?? []) {
    for (const part of activity.damage?.parts ?? []) if (part.types?.has?.("poison")) return true;
  }
  return false;
}

/** Poisons and diseases on a token or tile: ["Veneno: …", …]. */
export function poisonsOf(placeable, isTile) {
  const doc = placeable.document;
  const note = noteOf(doc);
  const out = [];
  if (note.kind === "poison") out.push({ style: "poison", label: `Veneno: ${note.name || "desconhecido"}` });
  if (note.kind === "disease") out.push({ style: "disease", label: `Doença: ${note.name || "desconhecida"}` });
  if (isTile) return out;
  const actor = doc.actor;
  if (!actor) return out;
  for (const effect of actor.appliedEffects ?? []) {
    const p = getF(effect, "poison");
    if (p || effect.statuses.has("poisoned")) out.push({ style: "poison", label: `Envenenado: ${p?.name || "veneno desconhecido"}` });
    const d = getF(effect, "disease");
    if (d || effect.statuses.has("diseased")) out.push({ style: "disease", label: `Doença: ${d?.name || effect.name}` });
  }
  const venom = actor.items.filter(i => dealsPoison(i));
  if (venom.length) out.push({ style: "poison", label: `Venenoso (${venom.map(i => i.name).join(", ")})` });
  for (const item of actor.items) if (item.type === "consumable" && item.system.type?.value === "poison") out.push({ style: "poison", label: `Veneno: ${item.name}` });
  return out;
}

/* -------------------------------------------- */

/** All findings of one sense on one target. */
export function findings(sense, placeable, isTile, revealed) {
  switch (sense) {
    case "evil-good": return findEvilGood(placeable, isTile);
    case "magic": return findMagic(placeable, isTile, revealed);
    case "poison": {
      const list = poisonsOf(placeable, isTile);
      if (!list.length) return [];
      return [{ style: list.some(l => l.style === "poison") ? "poison" : "disease", label: list.map(l => l.label).join("\n") }];
    }
  }
  return [];
}
