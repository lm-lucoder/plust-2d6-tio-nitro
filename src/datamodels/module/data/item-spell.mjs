import Nitro2d6ItemBase from "./base-item.mjs";

export default class Nitro2d6Spell extends Nitro2d6ItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.spellLevel = new fields.NumberField({ required: true, nullable: false, integer: true, initial: 1, min: 1, max: 9 });

    return schema;
  }
}