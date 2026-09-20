/** Pure +2d6 rules, based on the core rules on pages 16–40 of the supplied PDF. */
export const ATTRIBUTES = Object.freeze({
  str: 'Força', dex: 'Destreza', con: 'Constituição', int: 'Inteligência',
  wis: 'Sabedoria', cha: 'Carisma', pow: 'Poder'
});

export const OCCASION_MODIFIERS = Object.freeze([-6, -4, -2, 0, 2, 4, 6]);

export function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** The printed tables end at 10; campaign adjustments above that remain explicit. */
export function attributeBonus(value) {
  const score = Math.min(10, Math.floor(number(value)));
  return score < 3 ? 0 : score <= 5 ? score - 2 : 2 * (score - 3);
}

export function constitutionHealthBonus(value) {
  const score = Math.min(10, Math.floor(number(value)));
  return score < 3 ? 0 : score <= 6 ? (score - 2) * 5 : (score - 4) * 10;
}

export function strengthDamage(value) {
  return ({1: '1d6-4', 2: '1d6-2', 3: '1d6', 4: '1d6+1', 5: '1d6+2',
    6: '3d6', 7: '4d6', 8: '5d6', 9: '6d6', 10: '7d6'})[number(value)] ?? '';
}

export function sanityState(value, max) {
  const current = number(value);
  const maximum = number(max);
  if (maximum <= 0) return {bonus: 0, severity: 'none', label: 'Sem reserva de sanidade'};
  if (current <= 0) return {bonus: 4, severity: 'lost', label: 'Sanidade esgotada'};
  if (current <= maximum / 4) return {bonus: 4, severity: 'permanent', label: 'Insanidade permanente'};
  if (current <= maximum / 2) return {bonus: 2, severity: 'temporary', label: 'Insanidade temporária'};
  return {bonus: 0, severity: 'none', label: 'Sanidade preservada'};
}

export function deathThreshold({strength = 0, constitution = 0, heroic = false} = {}) {
  return -(number(strength) + number(constitution) + (heroic ? 10 : 0));
}

/** Only the original pair matters, never any purchased bonus dice. */
export function criticalResult(baseDice = []) {
  if (baseDice.length !== 2) return null;
  if (baseDice.every(value => number(value) === 6)) return 'success';
  if (baseDice.every(value => number(value) === 1)) return 'failure';
  return null;
}

export function resolveTest({total, baseDice = [], mode = 'normal', target = null}) {
  const critical = criticalResult(baseDice);
  if (mode === 'initiative' || target === null || target === undefined || target === '') {
    return {outcome: 'pending', critical, margin: null};
  }
  const margin = number(total) - number(target);
  const outcome = mode === 'opposed'
    ? (margin > 0 ? 'success' : margin < 0 ? 'failure' : 'tie')
    : (margin >= 0 ? 'success' : 'failure');
  return {outcome, critical, margin};
}

export function resolveDeath({total, baseDice = [], failures = 0}) {
  const stabilized = baseDice.length === 2 && baseDice.every(value => number(value) === 6);
  const nextFailures = Math.min(3, Math.max(0, number(failures)) + (number(total) < 6 ? 1 : 0));
  return {outcome: stabilized ? 'stabilized' : number(total) >= 6 ? 'success' : 'failure',
    stabilized, failures: nextFailures, dead: nextFailures >= 3};
}

export function resolveDamage(total, {reduction = 0, multiplier = 1} = {}) {
  const raw = Math.max(0, number(total));
  const multiplied = raw * Math.max(1, number(multiplier, 1));
  const absorbed = Math.min(multiplied, Math.max(0, number(reduction)));
  return {raw, multiplied, absorbed, final: multiplied - absorbed};
}

export function scaleModifier(choice, {mode = 'normal', attribute = 0} = {}) {
  if (!choice || choice === 'none') return 0;
  const choices = {
    normal10: {mode: 'normal', minimum: 6, value: 10},
    opposed6: {mode: 'opposed', minimum: 6, value: 6},
    opposed12: {mode: 'opposed', minimum: 11, value: 12}
  };
  const scale = choices[choice];
  if (!scale || mode !== scale.mode || number(attribute) < scale.minimum) {
    throw new Error('O bônus de escala escolhido não corresponde ao atributo e ao tipo de teste.');
  }
  return scale.value;
}

/** Keep each dice pool separate so the original 2d6 can be identified reliably. */
export function buildTestFormula({attribute = 0, rank = 0, occasion = 0, extra = 0,
  contextBonus = 0, scaleBonus = 0, narrative = false, action = false} = {}) {
  const parts = ['2d6[Base]'];
  if (narrative) parts.push('+ 1d6[Narrativo]');
  if (action) parts.push('+ 2d6[Ação]');
  for (const [label, value] of [['Atributo', attribute], ['Perícia', rank], ['Ocasião', occasion],
    ['Outros', extra], ['Contexto', contextBonus], ['Escala', scaleBonus]]) {
    const modifier = number(value);
    if (modifier) parts.push(`${modifier < 0 ? '-' : '+'} ${Math.abs(modifier)}[${label}]`);
  }
  return parts.join(' ');
}

/** Validate every cost first: callers can then persist all debits in one actor update. */
export function resourceCosts(system, {narrative = false, action = false, energyCost = 0} = {}) {
  const costs = {narrative: narrative ? 1 : 0, action: action ? 1 : 0,
    energy: Math.max(0, number(energyCost))};
  const labels = {narrative: 'pontos narrativos', action: 'pontos de ação', energy: 'pontos de energia'};
  const updates = {};
  for (const [key, cost] of Object.entries(costs)) {
    if (!cost) continue;
    const available = number(system[key]?.value);
    if (available < cost) throw new Error(`Não há ${labels[key]} suficientes (${available} disponíveis; custo ${cost}).`);
    updates[`system.${key}.value`] = available - cost;
  }
  return updates;
}
