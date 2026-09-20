import Nitro2d6DataModel from "./base-model.mjs";

export default class Nitro2d6ItemBase extends Nitro2d6DataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.description = new fields.StringField({ required: true, blank: true });

    return schema;
  }

}