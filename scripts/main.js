// Sylvie's Senses — entry point.

import { MODULE_ID, registerSettings } from "./settings.js";
import { registerSocket } from "./socket.js";
import { registerSenses, refresh, SENSES } from "./senses.js";
import { configurePoison, registerPoison, registerSecrecy } from "./poison.js";
import { editNote, registerNotes } from "./notes.js";

Hooks.once("init", () => {
  registerSettings();
});

// The actor class is final by now (dnd5e / Midi replace it during init).
Hooks.once("setup", () => {
  registerSecrecy();
});

Hooks.once("ready", () => {
  registerSocket();
  registerPoison();
  registerNotes();
  registerSenses();
  game.modules.get(MODULE_ID).api = { refresh, editNote, configurePoison, SENSES };
});
