// Sylvie's Senses — module socket: "ask this user to do something".

import { MODULE_ID } from "./settings.js";

const HANDLERS = {};
const CHANNEL = `module.${MODULE_ID}`;

export function onSocket(action, fn) {
  HANDLERS[action] = fn;
}

/** Run an action on a given user's client (locally when it is us). */
export function sendTo(userId, action, data) {
  if (userId === game.user.id) return HANDLERS[action]?.(data);
  game.socket.emit(CHANNEL, { action, userId, data });
}

export function registerSocket() {
  game.socket.on(CHANNEL, msg => {
    if (msg?.userId !== game.user.id) return;
    HANDLERS[msg.action]?.(msg.data);
  });
}

/** True on exactly one client: the active GM. */
export const isActiveGM = () => game.user.isGM && game.users.activeGM?.id === game.user.id;
