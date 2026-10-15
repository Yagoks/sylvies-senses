// Sylvie's Senses — shared constants and settings.

export const MODULE_ID = "sylvies-senses";

export const setting = key => game.settings.get(MODULE_ID, key);

export function registerSettings() {
  game.settings.register(MODULE_ID, "opacity", {
    name: "Aura opacity",
    hint: "Opacity of the detection auras (0.05–1).",
    scope: "world", config: true, type: Number, default: 0.15,
    range: { min: 0.05, max: 1, step: 0.05 }
  });
  game.settings.register(MODULE_ID, "gmSees", {
    name: "GM sees the players' senses",
    hint: "Off: the GM only sees the auras of creatures without a player owner (NPC casters). On: the GM also sees what the players' detection spells show.",
    scope: "client", config: true, type: Boolean, default: false
  });
  game.settings.register(MODULE_ID, "poisonPrompt", {
    name: "Ask about poisons",
    hint: "When the Poisoned condition is applied, ask the GM for the poison's name, duration, saving throw and whether it is secret.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "poisonInterval", {
    name: "Poison saves out of combat (minutes)",
    hint: "Out of combat, a poison that ends on a successful save asks for a new save every this many minutes of world time.",
    scope: "world", config: true, type: Number, default: 10
  });
}

/** Module flags read/written by path (works whether or not the module is the flag scope). */
export const getF = (doc, key) => foundry.utils.getProperty(doc?.flags ?? {}, `${MODULE_ID}.${key}`);
export const setF = (doc, key, value) => doc.update({ [`flags.${MODULE_ID}.${key}`]: value });
export const unsetF = (doc, key) => {
  const parts = key.split(".");
  const last = parts.pop();
  return doc.update({ [`flags.${MODULE_ID}.${[...parts, `-=${last}`].join(".")}`]: null });
};
