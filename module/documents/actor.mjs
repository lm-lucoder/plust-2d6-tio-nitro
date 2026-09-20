import { rollTest, rollDamage } from '../dice.mjs';
import { attributeBonus, constitutionHealthBonus, strengthDamage, deathThreshold } from '../rules.mjs';

export class Nitro2d6Actor extends Actor {
  prepareDerivedData() {
    super.prepareDerivedData();
    const s = this.system;
    const a = s.attributes;
    if (!a) return;
    s.initiativeBonus = attributeBonus(a.dex.value);
    s.attributeBonus = {wis: attributeBonus(a.wis.value), cha: attributeBonus(a.cha.value)};
    s.strengthDamage = strengthDamage(a.str.value);
    const items = [...this.items];
    // Coverage is contextual. Use the best worn armor, never stack all armor.
    s.totalReduction = s.damageReduction + Math.max(0, ...items.filter(i => i.type === 'armor' && i.system.equipped && i.system.quantity > 0).map(i => i.system.reduction));
    s.totalWeight = items.reduce((sum, i) => sum + (i.system.weight ?? 0) * (i.system.quantity ?? 0), 0);
    if (s.health.automatic) s.health.max = Math.max(1, s.health.base + (s.options.heroic ? 10 : 0) + a.str.value + a.con.value + constitutionHealthBonus(a.con.value) + s.health.bonus);
    if (s.energy.automatic) s.energy.max = Math.max(0, 10 + a.pow.value + s.energy.bonus);
    if (s.sanity.automatic) {
      const academic = Math.max(0, ...items.filter(i => i.type === 'skill' && i.system.academic).map(i => i.system.rank));
      s.sanity.max = Math.max(0, (s.options.heroic ? 20 : 10) + a.int.value + a.wis.value + academic + s.sanity.bonus);
    }
    s.deathThreshold = deathThreshold({strength: a.str.value, constitution: a.con.value, heroic: s.options.heroic});
    s.points.available = s.points.earned - s.points.spent;
  }
  getRollData() {
    const data = this.system.toObject(false);
    for (const key of ['initiativeBonus', 'attributeBonus', 'strengthDamage', 'totalReduction', 'totalWeight', 'deathThreshold']) {
      data[key] = foundry.utils.deepClone(this.system[key]);
    }
    return data;
  }
  async _preCreate(data, options, user) {
    const result = await super._preCreate(data, options, user);
    if (result === false) return false;
    this.updateSource({'prototypeToken.actorLink': this.type === 'character', 'prototypeToken.bar1.attribute': 'health', 'prototypeToken.bar2.attribute': 'energy'});
  }
  rollAttribute(attribute) { return rollTest(this, {attribute}); }
  rollInitiativeDialog() { return rollTest(this, {attribute: 'dex', kind: 'initiative', label: 'Iniciativa'}); }
  rollDeathTest() { return rollTest(this, {kind: 'death', label: 'Teste de morte'}); }
  rollSanity() {
    const attribute = this.system.attributes.wis.value >= this.system.attributes.int.value ? 'wis' : 'int';
    return rollTest(this, {attribute, kind: 'sanity', label: 'Sanidade'});
  }
  rollDamage() { return rollDamage(this, {formula: this.system.strengthDamage, label: 'Dano de Força'}); }
}
