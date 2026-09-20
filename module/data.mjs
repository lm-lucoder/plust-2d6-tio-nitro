import { NITRO2D6 } from './helpers/config.mjs';
const { NumberField, StringField, BooleanField, SchemaField, HTMLField } = foundry.data.fields;
const number = (initial = 0, options = {}) => new NumberField({required: true, nullable: false, integer: true, initial, ...options});
const string = (initial = '', options = {}) => new StringField({required: true, nullable: false, initial, ...options});
const bool = (initial = false) => new BooleanField({initial});
const schema = fields => new SchemaField(fields);
const attribute = (initial = 'str') => string(initial, {choices: Object.keys(NITRO2D6.attributes)});
const resource = (initial, health = false) => schema({value: number(initial, health ? {} : {min: 0}), max: number(initial, {min: 0}), bonus: number(), automatic: bool(true), ...(health ? {base: number(10, {min: 0})} : {})});

export class NitroActorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      attributes: schema(Object.fromEntries(Object.keys(NITRO2D6.attributes).map(key => [key, schema({value: number(key === 'pow' ? 0 : 1)})]))),
      details: schema(Object.fromEntries(['concept', 'occupation', 'ancestry', 'age', 'appearance', 'notes'].map(key => [key, string()]))),
      biography: new HTMLField({initial: ''}),
      health: resource(12, true), energy: resource(10), sanity: resource(12),
      narrative: schema({value: number(0, {min: 0})}), action: schema({value: number(0, {min: 0})}),
      options: schema({power: bool(true), sanity: bool(), heroic: bool()}),
      death: schema({failures: number(0, {min: 0, max: 3}), stabilized: bool()}),
      points: schema({earned: number(0, {min: 0}), spent: number(0, {min: 0})}),
      initiativeModifier: number(), damageReduction: number(0, {min: 0}), challenge: number(0, {min: 0, max: 10})
    };
  }
}
class NitroBaseItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() { return {description: new HTMLField({initial: ''}), source: string()}; }
}
const physical = () => ({quantity: number(1, {min: 0}), weight: number(0, {min: 0, integer: false}), price: string(), equipped: bool()});
export class NitroSkillData extends NitroBaseItemData {
  static defineSchema() { return {...super.defineSchema(), attribute: attribute('dex'), rank: number(1, {min: 0}), category: string('physical', {choices: Object.keys(NITRO2D6.skillCategories)}), specialization: string(), academic: bool()}; }
}
export class NitroWeaponData extends NitroBaseItemData {
  static defineSchema() { return {...super.defineSchema(), ...physical(), attribute: attribute('dex'), skill: string(), bonus: number(), damage: string('1d6'), damageType: string('lethal', {choices: Object.keys(NITRO2D6.damageTypes)}), range: string(), initiativeModifier: number(), ammunition: schema({value: number(0, {min: 0}), max: number(0, {min: 0})})}; }
}
export class NitroArmorData extends NitroBaseItemData {
  static defineSchema() { return {...super.defineSchema(), ...physical(), reduction: number(0, {min: 0})}; }
}
export class NitroEquipmentData extends NitroBaseItemData {
  static defineSchema() { return {...super.defineSchema(), ...physical(), bonus: number()}; }
}
export class NitroTraitData extends NitroBaseItemData {
  static defineSchema() { return {...super.defineSchema(), cost: number(1, {min: 0}), attribute: attribute('wis'), rank: number(0, {min: 0}), rollable: bool()}; }
}
export class NitroPowerData extends NitroBaseItemData {
  static defineSchema() { return {...super.defineSchema(), attribute: attribute('pow'), rank: number(1, {min: 0}), energyCost: number(1, {min: 0}), category: string('power', {choices: Object.keys(NITRO2D6.powerCategories)}), damage: string(), damageType: string('lethal', {choices: Object.keys(NITRO2D6.damageTypes)}), range: string(), duration: string(), area: string()}; }
}
export const actorDataModels = {character: NitroActorData, npc: NitroActorData};
export const itemDataModels = {skill: NitroSkillData, weapon: NitroWeaponData, armor: NitroArmorData, equipment: NitroEquipmentData, advantage: NitroTraitData, disadvantage: NitroTraitData, power: NitroPowerData};
