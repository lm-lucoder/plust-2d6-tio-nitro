import test from 'node:test';
import assert from 'node:assert/strict';
import {attributeBonus, constitutionHealthBonus, strengthDamage, sanityState, deathThreshold,
  criticalResult, resolveTest, resolveDeath, resolveDamage, scaleModifier, buildTestFormula,
  resourceCosts} from '../module/rules.mjs';
import {rollTest, rollDamage} from '../module/dice.mjs';

test('normal tests meet the CD; opposed tests must exceed their opponent', () => {
  assert.equal(resolveTest({total: 10, target: 10}).outcome, 'success');
  assert.equal(resolveTest({total: 9, target: 10}).outcome, 'failure');
  assert.equal(resolveTest({total: 10, target: 10, mode: 'opposed'}).outcome, 'tie');
  assert.equal(resolveTest({total: 11, target: 10, mode: 'opposed'}).outcome, 'success');
  assert.equal(resolveTest({total: 9, target: 10, mode: 'opposed'}).outcome, 'failure');
  assert.equal(resolveTest({total: 10, target: '', mode: 'opposed'}).outcome, 'pending');
  assert.equal(resolveTest({total: 10, target: null, mode: 'initiative'}).outcome, 'pending');
});

test('critical detection considers exactly the base pair and leaves effects to the GM', () => {
  assert.equal(criticalResult([6, 6]), 'success');
  assert.equal(criticalResult([1, 1]), 'failure');
  assert.equal(criticalResult([5, 6]), null);
  assert.equal(criticalResult([1, 1, 6]), null);
  assert.equal(resolveTest({total: 14, baseDice: [6, 6], target: 30}).outcome, 'failure');
  assert.equal(resolveTest({total: 14, baseDice: [6, 6], target: 30}).critical, 'success');
});

test('bonus dice are added as separate pools, while signed numeric modifiers are preserved', () => {
  assert.equal(buildTestFormula({attribute: 3, rank: 2, occasion: -4, extra: 1, narrative: true, action: true}),
    '2d6[Base] + 1d6[Narrativo] + 2d6[Ação] + 3[Atributo] + 2[Perícia] - 4[Ocasião] + 1[Outros]');
  assert.equal(buildTestFormula({attribute: -1}), '2d6[Base] - 1[Atributo]');
  assert.equal(buildTestFormula({contextBonus: 2, scaleBonus: 6}), '2d6[Base] + 2[Contexto] + 6[Escala]');
});

test('printed initiative/context, Constitution and Strength tables retain their breakpoints', () => {
  assert.deepEqual(Array.from({length: 10}, (_, i) => attributeBonus(i + 1)), [0, 0, 1, 2, 3, 6, 8, 10, 12, 14]);
  assert.deepEqual(Array.from({length: 10}, (_, i) => constitutionHealthBonus(i + 1)), [0, 0, 5, 10, 15, 20, 30, 40, 50, 60]);
  assert.equal(attributeBonus(-3), 0);
  assert.equal(constitutionHealthBonus(-3), 0);
  assert.equal(strengthDamage(1), '1d6-4');
  assert.equal(strengthDamage(5), '1d6+2');
  assert.equal(strengthDamage(6), '3d6');
  assert.equal(strengthDamage(10), '7d6');
  assert.equal(strengthDamage(11), '');
});

test('the two printed scale rules are explicit and restricted to matching tests and attributes', () => {
  assert.equal(scaleModifier('normal10', {mode: 'normal', attribute: 6}), 10);
  assert.equal(scaleModifier('opposed6', {mode: 'opposed', attribute: 6}), 6);
  assert.equal(scaleModifier('opposed12', {mode: 'opposed', attribute: 11}), 12);
  assert.equal(scaleModifier('none', {mode: 'normal', attribute: 11}), 0);
  assert.throws(() => scaleModifier('normal10', {mode: 'opposed', attribute: 8}));
  assert.throws(() => scaleModifier('opposed12', {mode: 'opposed', attribute: 10}));
  assert.throws(() => scaleModifier('normal10', {mode: 'normal', attribute: 5}));
});

test('death tests count failures, never reset them on ordinary success, and stabilize on 12', () => {
  assert.deepEqual(resolveDeath({total: 5, baseDice: [2, 3], failures: 2}),
    {outcome: 'failure', stabilized: false, failures: 3, dead: true});
  assert.deepEqual(resolveDeath({total: 6, baseDice: [3, 3], failures: 2}),
    {outcome: 'success', stabilized: false, failures: 2, dead: false});
  assert.deepEqual(resolveDeath({total: 12, baseDice: [6, 6], failures: 2}),
    {outcome: 'stabilized', stabilized: true, failures: 2, dead: false});
  assert.equal(deathThreshold({strength: 2, constitution: 3}), -5);
  assert.equal(deathThreshold({strength: 2, constitution: 3, heroic: true}), -15);
});

test('sanity thresholds include exactly one half and one quarter without stacking bonuses', () => {
  assert.equal(sanityState(11, 20).bonus, 0);
  assert.equal(sanityState(10, 20).bonus, 2);
  assert.equal(sanityState(5, 20).bonus, 4);
  assert.equal(sanityState(0, 20).severity, 'lost');
  assert.equal(sanityState(0, 0).bonus, 0);
});

test('damage has a zero floor, and optional doubling happens before reduction', () => {
  assert.deepEqual(resolveDamage(4, {reduction: 3, multiplier: 2}), {raw: 4, multiplied: 8, absorbed: 3, final: 5});
  assert.equal(resolveDamage(4, {reduction: 9}).final, 0);
  assert.equal(resolveDamage(-3, {reduction: 2}).final, 0);
  assert.equal(resolveDamage(4, {reduction: -2}).final, 4);
});

test('all optional resource debits validate before any mutation', () => {
  const system = {narrative: {value: 1}, action: {value: 2}, energy: {value: 4}};
  assert.deepEqual(resourceCosts(system), {});
  assert.deepEqual(resourceCosts(system, {narrative: true, action: true, energyCost: 3}),
    {'system.narrative.value': 0, 'system.action.value': 1, 'system.energy.value': 1});
  assert.throws(() => resourceCosts(system, {narrative: true, energyCost: 5}), /energia/);
  assert.equal(system.narrative.value, 1);
});

function mockEnvironment({answers = [], dice = [4, 3], total = 12} = {}) {
  const updates = [], messages = [], errors = [], formulas = [], contexts = [];
  globalThis.ui = {notifications: {warn: value => errors.push(value), error: value => errors.push(value)}};
  globalThis.game = {settings: {get: () => 'public'}, i18n: {localize: value => value},
    user: {targets: new Set()}, combat: null};
  globalThis.CONFIG = {ChatMessage: {modes: {public: {label: 'Público'}, blind: {label: 'Cego'}}}};
  globalThis.ChatMessage = {getSpeaker: () => ({alias: 'Personagem'})};
  globalThis.foundry = {applications: {
    api: {DialogV2: {wait: async () => answers.shift() ?? null}},
    handlebars: {renderTemplate: async (_path, context) => { contexts.push(context); return '<article>Teste</article>'; }}
  }};
  globalThis.Roll = class {
    constructor(formula) { formulas.push(formula); this.total = total; this.dice = [{results: dice.map(result => ({result, active: true}))}]; }
    async evaluate() { return this; }
    async render() { return '<div class="dice-roll">12</div>'; }
    async toMessage(data, options) { messages.push({data, options}); return data; }
    static replaceFormulaData(formula, data) { return formula.replace('@strengthDamage', data.strengthDamage ?? '@strengthDamage'); }
    static validate(formula) { return !formula.includes('invalid'); }
  };
  const actor = {id: 'actor1', name: 'Personagem', isOwner: true, items: [],
    system: {attributes: {str: {value: 3}, dex: {value: 3}, int: {value: 3}, wis: {value: 2}},
      narrative: {value: 1}, action: {value: 1}, energy: {value: 3}, sanity: {value: 10, max: 20},
      death: {failures: 1}, strengthDamage: '1d6', initiativeBonus: 1, initiativeModifier: -1},
    getRollData() { return this.system; },
    async update(patch) {
      updates.push(patch);
      for (const [key, value] of Object.entries(patch)) {
        const [, group, field] = key.split('.');
        this.system[group][field] = value;
      }
    }
  };
  return {actor, updates, messages, errors, formulas, contexts};
}

const normalAnswer = overrides => ({attribute: 'str', rank: '0', occasion: '0', extra: '0', scale: 'none',
  mode: 'normal', difficulty: '10', narrative: false, action: false, messageMode: 'public', ...overrides});

test('closing a test dialog spends no resources and creates no roll', async () => {
  const environment = mockEnvironment({answers: [false]});
  assert.equal(await rollTest(environment.actor), null);
  assert.equal(environment.updates.length, 0);
  assert.equal(environment.formulas.length, 0);
  assert.equal(environment.messages.length, 0);
});

test('confirmed resources debit once and bonus dice cannot change the base critical', async () => {
  const environment = mockEnvironment({answers: [normalAnswer({narrative: true, action: true})], dice: [1, 1], total: 18});
  const response = await rollTest(environment.actor);
  assert.equal(response.result.critical, 'failure');
  assert.deepEqual(environment.updates, [{'system.narrative.value': 0, 'system.action.value': 0}]);
  assert.equal(environment.messages[0].options.messageMode, 'public');
  assert.match(environment.formulas[0], /2d6\[Base\] \+ 1d6\[Narrativo\] \+ 2d6\[Ação\]/);
});

test('power energy is opt-in; insufficient PE rejects the whole spend before rolling', async () => {
  const item = {id: 'power1', type: 'power', name: 'Fogo', system: {attribute: 'str', rank: 2, energyCost: 5}};
  let environment = mockEnvironment({answers: [normalAnswer({narrative: true, spendEnergy: true, energyCost: '5'})]});
  const originalConsoleError = console.error;
  console.error = () => {};
  try { assert.equal(await rollTest(environment.actor, {item}), null); }
  finally { console.error = originalConsoleError; }
  assert.equal(environment.formulas.length, 0);
  assert.equal(environment.updates.length, 0);
  assert.match(environment.errors[0], /energia/);
  environment = mockEnvironment({answers: [normalAnswer({spendEnergy: false, energyCost: '5'})]});
  await rollTest(environment.actor, {item});
  assert.equal(environment.updates.length, 0);
  assert.equal(environment.messages.length, 1);
});

test('two confirmations cannot both spend the last narrative point', async () => {
  const environment = mockEnvironment({answers: [normalAnswer({narrative: true}), normalAnswer({narrative: true})]});
  const originalConsoleError = console.error;
  console.error = () => {};
  try { await Promise.all([rollTest(environment.actor), rollTest(environment.actor)]); }
  finally { console.error = originalConsoleError; }
  assert.equal(environment.messages.length, 1);
  assert.equal(environment.updates.length, 1);
  assert.equal(environment.actor.system.narrative.value, 0);
});

test('death rolls do not apply attributes, skill, or ordinary modifiers', async () => {
  const environment = mockEnvironment({answers: [{recordDeath: true, messageMode: 'public'}], dice: [2, 3], total: 5});
  const response = await rollTest(environment.actor, {kind: 'death'});
  assert.equal(environment.formulas[0], '2d6[Base]');
  assert.equal(response.result.failures, 2);
  assert.deepEqual(environment.updates[0], {'system.death.failures': 2});
});

test('damage expands Strength formula, applies an explicit multiplier then RD, and never mutates an actor', async () => {
  const environment = mockEnvironment({answers: [{formula: '@strengthDamage+1', extra: '2', reduction: '3',
    doubleDamage: true, damageType: 'Letal', messageMode: 'public'}], total: 7});
  const response = await rollDamage(environment.actor);
  assert.equal(environment.formulas[0], '(1d6+1) + 2');
  assert.equal(response.result.final, 11);
  assert.equal(environment.updates.length, 0);
});
