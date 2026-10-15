# Sylvie's Senses

A Foundry VTT v13 module for dnd5e 5.x that automates the detection spells and secret poisons. Requires **Sequencer**
and **JB2A** (Patreon or free) for the auras.

## Detection spells

Casting **Detect Evil and Good**, **Detect Magic** or **Detect Poison and Disease** gives the caster a "sense".
- **Duration:** the sense lasts the spell's duration and is tied to concentration, so losing concentration ends it.
- **Which spells count:** the module recognises the spells by their identifier (`detect-evil-and-good`, `detect-magic`,
  `detect-poison-and-disease`). It also accepts any item flagged `flags.sylvies-senses.sense`.
- **Midi:** not needed.

While the sense lasts:
- **Auras:** every token or tile within **30 ft** that the sense finds gets a faint JB2A aura (opacity in the settings).
- **Who sees them:** only the caster's owner. Each client draws its own auras; nothing is shared or saved. The GM sees
  NPC casters' auras, and players' too if *GM sees the players' senses* is on.
- **Blocking:** walls block the sense, sight walls and closed doors included. A target marked *shielded* (lead, metal,
  thick stone) is never found.
- **Hidden from divination:** a creature is never found while it wears an **Amulet of Proof against Detection and
  Location** (equipped and attuned), is under **Nondetection**, or carries an item or effect flagged
  `flags.sylvies-senses.blocksDetection`.
- **Tooltip:** hovering a marked target shows what was sensed, to the caster only.

| Spell | Finds | Aura |
|---|---|---|
| Detect Evil and Good | Aberration, Celestial, Elemental, Fey, Fiend, Undead; consecrated/desecrated tiles (Hallow) | rune 02 per type (grey, yellow, blue, purple, red, green) |
| Detect Magic | effects from spells (with the spell's school), magical items carried, tiles noted as magic | neutral rune; after examining, the school's rune |
| Detect Poison and Disease | creatures with poison damage, poisoned/diseased creatures, poison items, tiles noted as poison/disease | poison markers |

**Detect Magic** follows the rules:
1. At first you only sense *a magic aura*.
2. Click an aura to spend your **Magic action** examining it (it posts to the chat and marks the action used with Midi).
3. Every aura in range then shows its school.

## GM notes (tiles and tokens)

The eye button on the Tile HUD and the Token HUD (GM only) sets what the spells find there. Hidden tiles count too, so
an invisible tile is how you mark magic or poison on the ground or over an area.
- **Magic:** a school and a note, e.g. a rune-carved rock.
- **Poison or disease:** a name, e.g. a cup of wine.
- **Consecrated or desecrated ground:** for Hallow.
- **Shielded:** nothing is detected there.
- **True type (tokens only):** Detect Evil and Good reads this instead of the sheet, for disguised creatures.

## Poisons

When the **Poisoned** condition is applied to a creature that isn't immune, the GM is asked:
- **Poison name:** shown by Detect Poison and Disease.
- **Saving throw:** ability and DC.
- **Duration:**
  - until the end of the creature's next turn;
  - until the start of its next turn;
  - 1 minute, 10 minutes, hours or days;
  - keep the effect's own duration.
- **Ends on a successful save:** off means only time or magic ends it.
- **Secret:** players don't see the icon, the effect or the condition. The GM sees *Poisoned — name (secreto)*. The
  condition is real, so disadvantage, immunities and Lesser Restoration keep working.

Saves (only when *ends on a successful save* is on):
- **In combat:** at the start of each of the creature's turns.
- **Out of combat:** every 10 minutes of world time (setting). 1-minute poisons only roll in combat.
- **Who rolls:** an online player who owns the creature, otherwise the GM.
- **Secret poison prompt:** *"You don't feel well…"*, without naming the poison.
- **Result:** a success removes the poison. Time-based durations expire with world time (Times Up or the module).

## API

`game.modules.get("sylvies-senses").api` — `refresh()`, `editNote(doc)`, `configurePoison(effect)`, `SENSES`.
