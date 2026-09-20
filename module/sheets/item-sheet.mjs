import { NITRO2D6 } from '../helpers/config.mjs';
import { enrich } from './sheet-helpers.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;

/** A focused form for every reusable Item type. */
export class Nitro2d6ItemSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ['nitro2d6', 'item-sheet'],
    position: { width: 620, height: 730 },
    window: { resizable: true, icon: 'fa-solid fa-scroll' },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: { rollItem: this.onRollItem, rollDamage: this.onRollDamage }
  };

  static PARTS = {
    sheet: { template: 'systems/nitro2d6/templates/item/nitro-item.hbs', scrollable: ['.sheet-body'] }
  };

  static TABS = {
    sheet: {
      initial: 'details',
      tabs: [
        { id: 'details', label: 'Configuração', icon: 'fa-solid fa-sliders' },
        { id: 'description', label: 'Descrição', icon: 'fa-solid fa-book-open' }
      ]
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.item;
    const type = item.type;
    Object.assign(context, {
      item, system: item.system, config: NITRO2D6,
      typeLabel: NITRO2D6.itemTypes[type],
      isSkill: type === 'skill', isWeapon: type === 'weapon', isArmor: type === 'armor',
      isEquipment: type === 'equipment', isPower: type === 'power',
      isTrait: ['advantage', 'disadvantage'].includes(type),
      isDisadvantage: type === 'disadvantage',
      isPhysical: ['weapon', 'armor', 'equipment'].includes(type),
      hasAttribute: ['skill', 'weapon', 'power', 'advantage', 'disadvantage'].includes(type),
      hasDamage: ['weapon', 'power'].includes(type),
      canRoll: Boolean(item.actor) && (['skill', 'weapon', 'power'].includes(type) || item.system.rollable),
      skillNames: item.actor?.items.filter(i => i.type === 'skill').map(i => i.name) ?? [],
      powerCategories: { power: 'Poder', magic: 'Magia' },
      enrichedDescription: await enrich(item.system.description, item)
    });
    return context;
  }

  static onRollItem() { return this.item.roll(); }
  static onRollDamage() { return this.item.rollDamage(); }
}
