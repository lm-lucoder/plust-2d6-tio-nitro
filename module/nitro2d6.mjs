import { Nitro2d6Actor } from './documents/actor.mjs';
import { Nitro2d6Item } from './documents/item.mjs';
import { Nitro2d6ActorSheet } from './sheets/actor-sheet.mjs';
import { Nitro2d6ItemSheet } from './sheets/item-sheet.mjs';
import { actorDataModels, itemDataModels } from './data.mjs';
import { NITRO2D6 } from './helpers/config.mjs';
import { rollTest, rollDamage } from './dice.mjs';

Hooks.once('init', () => {
  CONFIG.NITRO2D6 = NITRO2D6;
  CONFIG.Actor.documentClass = Nitro2d6Actor;
  CONFIG.Item.documentClass = Nitro2d6Item;
  Object.assign(CONFIG.Actor.dataModels, actorDataModels);
  Object.assign(CONFIG.Item.dataModels, itemDataModels);
  CONFIG.ActiveEffect.legacyTransferral = false;
  CONFIG.Combat.initiative = {formula: '2d6 + @attributes.dex.value + @initiativeBonus + @initiativeModifier', decimals: 0};
  CONFIG.time.roundTime = 3;
  const sheets = foundry.applications.apps.DocumentSheetConfig;
  sheets.registerSheet(Actor, 'nitro2d6', Nitro2d6ActorSheet, {types: Object.keys(actorDataModels), makeDefault: true, label: '+2d6 • Personagem'});
  sheets.registerSheet(Item, 'nitro2d6', Nitro2d6ItemSheet, {types: Object.keys(itemDataModels), makeDefault: true, label: '+2d6 • Item'});
  game.nitro2d6 = {Nitro2d6Actor, Nitro2d6Item, rollTest, rollDamage, rollItemMacro};
});
Hooks.once('ready', () => Hooks.on('hotbarDrop', (bar, data, slot) => {
  if (data.type !== 'Item' || !data.uuid || !/(Actor|Token)\./.test(data.uuid)) return;
  createItemMacro(data, slot).catch(error => ui.notifications.error(error.message));
  return false;
}));
async function createItemMacro(data, slot) {
  const item = await Item.fromDropData(data);
  if (!item?.actor) return;
  const command = `game.nitro2d6.rollItemMacro(${JSON.stringify(item.uuid)});`;
  let macro = game.macros.find(m => m.command === command && m.isOwner);
  macro ??= await Macro.create({name: item.name, type: 'script', img: item.img, command});
  await game.user.assignHotbarMacro(macro, slot);
}
async function rollItemMacro(uuid) {
  const item = await fromUuid(uuid);
  if (!item?.actor) return ui.notifications.warn('O item desta macro não está mais na ficha.');
  return item.roll();
}
