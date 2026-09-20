import { NITRO2D6 } from '../helpers/config.mjs';
import { rollTest, rollDamage } from '../dice.mjs';

export class Nitro2d6Item extends Item {
  getRollData() { return {...(this.actor?.getRollData() ?? {}), item: this.system.toObject?.() ?? this.system}; }
  async _preCreate(data, options, user) {
    const result = await super._preCreate(data, options, user);
    if (result === false) return false;
    if (!data.img || data.img === 'icons/svg/item-bag.svg') this.updateSource({img: NITRO2D6.icons[this.type]});
  }
  async roll() {
    if (!this.actor) return ui.notifications.info('Adicione este item a uma ficha para usar os atributos do personagem.');
    if (!this.actor.isOwner) return ui.notifications.warn('Você não tem permissão para usar este personagem.');
    if (['skill', 'weapon', 'power'].includes(this.type) || this.system.rollable) return rollTest(this.actor, {item: this, attribute: this.system.attribute, label: this.name});
    const description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.system.description, {secrets: false, relativeTo: this, rollData: this.getRollData()});
    const message = {speaker: ChatMessage.getSpeaker({actor: this.actor}), content: `<div class="nitro2d6 item-card"><h3>${foundry.utils.escapeHTML(this.name)}</h3>${description || '<p>Sem descrição.</p>'}</div>`};
    return ChatMessage.create(message, {messageMode: game.settings.get('core', 'messageMode')});
  }
  rollDamage() {
    if (!this.actor) return ui.notifications.info('Adicione este item a uma ficha para rolar o dano.');
    return rollDamage(this.actor, {item: this, formula: this.system.damage, label: this.name});
  }
}
