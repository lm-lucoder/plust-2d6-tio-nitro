import { NITRO2D6 } from '../helpers/config.mjs';
import { itemView, signed, enrich } from './sheet-helpers.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;

/** The +2d6 character and NPC sheet, using Foundry's native V14 form and drag/drop APIs. */
export class Nitro2d6ActorSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ['nitro2d6', 'actor-sheet'],
    position: { width: 940, height: 820 },
    window: { resizable: true, icon: 'fa-solid fa-dice' },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      rollAttribute: this.onRollAttribute,
      rollItem: this.onRollItem,
      rollDamage: this.onRollDamage,
      rollInitiative: this.onRollInitiative,
      rollDeath: this.onRollDeath,
      rollSanity: this.onRollSanity,
      createItem: this.onCreateItem,
      editItem: this.onEditItem,
      deleteItem: this.onDeleteItem,
      toggleEquipped: this.onToggleEquipped,
      adjustResource: this.onAdjustResource
    }
  };

  static PARTS = {
    sheet: {
      template: 'systems/nitro2d6/templates/actor/nitro-actor.hbs',
      templates: ['systems/nitro2d6/templates/shared/item-list.hbs'],
      scrollable: ['.sheet-body']
    }
  };

  static TABS = {
    sheet: {
      initial: 'tests',
      tabs: [
        { id: 'tests', label: 'Testes', icon: 'fa-solid fa-dice' },
        { id: 'combat', label: 'Combate', icon: 'fa-solid fa-shield-halved' },
        { id: 'abilities', label: 'Capacidades', icon: 'fa-solid fa-bolt' },
        { id: 'equipment', label: 'Equipamento', icon: 'fa-solid fa-suitcase' },
        { id: 'story', label: 'História', icon: 'fa-solid fa-feather-pointed' }
      ]
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const system = actor.system;
    const items = actor.items.contents.slice().sort((a, b) => a.sort - b.sort).map(itemView);
    const groups = Object.fromEntries(Object.keys(NITRO2D6.itemTypes).map(type => [type, items.filter(i => i.type === type)]));
    const skillGroups = Object.entries(NITRO2D6.skillCategories).map(([key, label]) => ({
      key, label, items: (groups.skill ?? []).filter(i => i.system.category === key)
    }));
    const resourceDefinitions = [
      ['health', 'Pontos de vida', 'PV', 'fa-heart-pulse'],
      ['energy', 'Energia / Mana', 'PE', 'fa-bolt'],
      ...(system.options.sanity ? [['sanity', 'Sanidade', 'SAN', 'fa-brain']] : [])
    ];
    const resources = resourceDefinitions.map(([key, label, abbreviation, icon]) => {
      const resource = system[key];
      return {
        key, label, abbreviation, icon, ...resource,
        percent: Math.max(0, Math.min(100, (resource.value / (resource.max || 1)) * 100)),
        low: resource.value <= 0
      };
    });
    Object.assign(context, {
      actor, system, config: NITRO2D6, groups, skillGroups, resources,
      isNPC: actor.type === 'npc',
      actorType: actor.type === 'npc' ? 'Personagem do mestre' : 'Personagem de jogador',
      attributes: Object.entries(NITRO2D6.attributes)
        .filter(([key]) => key !== 'pow' || system.options.power)
        .map(([key, label]) => ({ key, label, abbreviation: NITRO2D6.abbreviations[key], value: system.attributes[key].value })),
      initiativeLabel: signed(system.initiativeBonus + system.initiativeModifier),
      wisdomLabel: signed(system.attributeBonus?.wis),
      charismaLabel: signed(system.attributeBonus?.cha),
      pointsRemaining: system.points.earned - system.points.spent,
      skillCount: groups.skill?.length ?? 0,
      hasPowers: system.options.power || groups.power?.length > 0,
      enrichedBiography: await enrich(system.biography, actor)
    });
    return context;
  }

  static onRollAttribute(_event, target) {
    return this.actor.rollAttribute(target.dataset.attribute);
  }

  static onRollItem(_event, target) {
    return this.actor.items.get(target.closest('[data-item-id]')?.dataset.itemId)?.roll();
  }

  static onRollDamage(_event, target) {
    const item = this.actor.items.get(target.closest('[data-item-id]')?.dataset.itemId);
    return item ? item.rollDamage() : this.actor.rollDamage();
  }

  static onRollInitiative() { return this.actor.rollInitiativeDialog(); }
  static onRollDeath() { return this.actor.rollDeathTest(); }
  static onRollSanity() { return this.actor.rollSanity(); }

  static async onCreateItem(_event, target) {
    if (!this.isEditable) return;
    const type = target.dataset.type;
    if (!(type in NITRO2D6.itemTypes)) return;
    const names = {
      skill: 'Nova perícia', weapon: 'Nova arma', armor: 'Nova armadura',
      equipment: 'Novo equipamento', advantage: 'Nova vantagem',
      disadvantage: 'Nova desvantagem', power: 'Novo poder ou magia'
    };
    const system = {};
    if (type === 'skill' && target.dataset.category) system.category = target.dataset.category;
    const [item] = await this.actor.createEmbeddedDocuments('Item', [{ name: names[type], type, system }]);
    return item?.sheet.render({ force: true });
  }

  static onEditItem(_event, target) {
    const item = this.actor.items.get(target.closest('[data-item-id]')?.dataset.itemId);
    return item?.sheet.render({ force: true });
  }

  static async onDeleteItem(_event, target) {
    if (!this.isEditable) return;
    const item = this.actor.items.get(target.closest('[data-item-id]')?.dataset.itemId);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'Remover da ficha' },
      content: `<p>Remover <strong>${Handlebars.escapeExpression(item.name)}</strong> da ficha de ${Handlebars.escapeExpression(this.actor.name)}?</p>`,
      yes: { label: 'Remover' }, no: { label: 'Cancelar' }, rejectClose: false
    });
    if (confirmed) return item.delete();
  }

  static onToggleEquipped(_event, target) {
    if (!this.isEditable) return;
    const item = this.actor.items.get(target.closest('[data-item-id]')?.dataset.itemId);
    if (item && ['weapon', 'armor', 'equipment'].includes(item.type)) {
      return item.update({ 'system.equipped': !item.system.equipped });
    }
  }

  static onAdjustResource(_event, target) {
    if (!this.isEditable) return;
    const key = target.dataset.resource;
    if (!['health', 'energy', 'sanity', 'narrative', 'action'].includes(key)) return;
    const resource = this.actor.system[key];
    const value = resource.value + Number(target.dataset.delta);
    return this.actor.update({ [`system.${key}.value`]: key === 'health' ? value : Math.max(0, value) });
  }
}
