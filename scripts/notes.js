// Sylvie's Senses — GM notes on tiles and tokens: what the detection spells find there.
// A button on the Tile HUD and the Token HUD (GM only) opens the note: magic (school + text), poison or disease (name),
// consecrated / desecrated ground (Hallow), "shielded by lead" (nothing is detected), and for tokens a "true type"
// that Detect Evil and Good reads instead of the sheet (disguised creatures).

import { MODULE_ID, setF, unsetF } from "./settings.js";
import { noteOf } from "./sources.js";
import { schedule } from "./senses.js";

const KINDS = {
  "": "Nada",
  magic: "Magia",
  poison: "Veneno",
  disease: "Doença",
  consecrated: "Consagrado (Hallow)",
  desecrated: "Profanado (Hallow)"
};
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const options = (map, current) => Object.entries(map).map(([k, label]) => `<option value="${k}" ${k === (current ?? "") ? "selected" : ""}>${esc(label)}</option>`).join("");

export async function editNote(doc) {
  const isToken = doc.documentName === "Token";
  const note = noteOf(doc);
  const schools = Object.fromEntries([["", "—"], ...Object.entries(CONFIG.DND5E.spellSchools).map(([k, s]) => [k, s.label])]);
  const types = Object.fromEntries([["", "Da ficha"], ...Object.entries(CONFIG.DND5E.creatureTypes).map(([k, t]) => [k, t.label])]);
  const content = `
    <div class="sylvies-senses-form">
      <div class="form-group"><label>O que é detectado</label><select name="kind">${options(KINDS, note.kind)}</select></div>
      <div class="form-group"><label>Escola (magia)</label><select name="school">${options(schools, note.school)}</select></div>
      <div class="form-group"><label>Nome (veneno ou doença)</label><input type="text" name="name" value="${esc(note.name)}"></div>
      <div class="form-group"><label>Nota</label><input type="text" name="text" value="${esc(note.text)}" placeholder="ex.: runas de proteção"></div>
      <div class="form-group"><label class="checkbox"><input type="checkbox" name="shielded" ${note.shielded ? "checked" : ""}>
        Protegido (chumbo, metal ou pedra grossa): nada é detectado aqui</label></div>
      ${isToken ? `<div class="form-group"><label>Tipo verdadeiro</label><select name="trueType">${options(types, note.trueType)}</select></div>
      <p class="hint">Para criaturas disfarçadas: o Detect Evil and Good usa este tipo em vez do da ficha.</p>` : ""}
    </div>`;
  const data = await foundry.applications.api.DialogV2.wait({
    window: { title: `Detecção — ${doc.name ?? (isToken ? "token" : "tile")}`, icon: "fa-solid fa-eye" },
    content,
    buttons: [
      { action: "save", label: "Salvar", icon: "fa-solid fa-check", default: true,
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
      { action: "clear", label: "Limpar", icon: "fa-solid fa-eraser" }
    ],
    rejectClose: false
  });
  if (data === "clear") await unsetF(doc, "note");
  else if (data && typeof data === "object") {
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== "" && v !== false && v != null));
    if (Object.keys(clean).length) { await unsetF(doc, "note"); await setF(doc, "note", clean); }
    else await unsetF(doc, "note");
  }
  schedule();
}

function addButton(hud, html) {
  if (!game.user.isGM) return;
  const doc = hud.object?.document;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const col = root?.querySelector(".col.right");
  if (!doc || !col) return;
  const note = noteOf(doc);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `control-icon${Object.keys(note).length ? " active" : ""}`;
  btn.dataset.tooltip = "Detecção (Sylvie's Senses)";
  btn.innerHTML = '<i class="fa-solid fa-eye"></i>';
  btn.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); editNote(doc); });
  col.append(btn);
}

export function registerNotes() {
  Hooks.on("renderTokenHUD", addButton);
  Hooks.on("renderTileHUD", addButton);
}
