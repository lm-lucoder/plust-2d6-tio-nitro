import {ATTRIBUTES, OCCASION_MODIFIERS, attributeBonus, number, buildTestFormula,
  resourceCosts, resolveTest, resolveDeath, resolveDamage, sanityState, scaleModifier} from './rules.mjs';

const ROOT = 'systems/nitro2d6/templates';
const actorQueues = new WeakMap();
const renderTemplate = (path, data) => foundry.applications.handlebars.renderTemplate(path, data);
const signed = value => `${number(value) >= 0 ? '+' : ''}${number(value)}`;
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function visibilityModes() {
  const selected = game.settings.get('core', 'messageMode');
  return Object.entries(CONFIG.ChatMessage.modes).filter(([key]) => key !== 'ic')
    .map(([value, config]) => ({value, label: game.i18n.localize(config.label), selected: value === selected}));
}

function findCombatant(actor) {
  return game.combat?.combatants.find(combatant => actor.isToken
    ? combatant.tokenId === actor.token?.id : combatant.actorId === actor.id);
}

/** Serialize confirmations on the same actor so rapid clicks cannot overspend locally. */
async function withActorLock(actor, action) {
  if (!actor) return action();
  const previous = actorQueues.get(actor) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(action);
  actorQueues.set(actor, current);
  try { return await current; }
  finally { if (actorQueues.get(actor) === current) actorQueues.delete(actor); }
}

function attributeValue(actor, key) {
  return number(actor.system.attributes?.[key]?.value);
}

function contextValue(actor, key) {
  return ['wis', 'cha'].includes(key)
    ? number(actor.system.attributeBonus?.[key], attributeBonus(attributeValue(actor, key))) : 0;
}

function formValues(form) {
  const values = Object.fromEntries(new FormData(form));
  for (const input of form.querySelectorAll('input[type="checkbox"]')) values[input.name] = input.checked;
  return values;
}

function testComponents(actor, values, {kind, item}) {
  if (kind === 'death') return {};
  const attribute = kind === 'initiative' ? 'dex' : values.attribute;
  if (!(attribute in ATTRIBUTES)) throw new Error('Escolha um atributo válido para o teste.');
  const occasion = number(values.occasion);
  if (!OCCASION_MODIFIERS.includes(occasion)) throw new Error('Escolha um modificador de ocasião válido.');
  const fixedBonus = kind === 'initiative'
    ? number(actor.system.initiativeBonus) + number(actor.system.initiativeModifier)
    : item?.type === 'weapon' ? number(item.system.bonus) : 0;
  const sanityBonus = kind === 'sanity' ? sanityState(actor.system.sanity?.value, actor.system.sanity?.max).bonus : 0;
  return {
    attribute: attributeValue(actor, attribute),
    rank: kind === 'initiative' ? 0 : number(values.rank),
    occasion, extra: number(values.extra) + fixedBonus + sanityBonus,
    contextBonus: values.contextual ? contextValue(actor, attribute) : 0,
    scaleBonus: scaleModifier(values.scale, {mode: values.mode, attribute: attributeValue(actor, attribute)}),
    narrative: !!values.narrative, action: !!values.action
  };
}

function attachTestDialog(dialog, actor, options, skills) {
  const form = dialog.element.querySelector('form');
  const update = event => {
    if (event?.target?.name === 'skill') {
      const skill = skills.find(skill => skill.id === event.target.value);
      form.elements.rank.value = skill ? number(skill.system.rank) : 0;
      if (skill?.system.attribute && form.elements.attribute) form.elements.attribute.value = skill.system.attribute;
    }
    const values = formValues(form);
    const mode = values.mode;
    for (const element of form.querySelectorAll('[data-mode]')) element.hidden = element.dataset.mode !== mode;
    const contextual = form.elements.contextual;
    if (contextual) {
      contextual.disabled = !['wis', 'cha'].includes(values.attribute);
      if (contextual.disabled) contextual.checked = false;
      const hint = form.querySelector('[data-context-label]');
      hint.textContent = values.attribute === 'cha'
        ? `Sedução, diplomacia ou manipulação (${signed(contextValue(actor, 'cha'))})`
        : `Percepção ou força de vontade (${signed(contextValue(actor, 'wis'))})`;
    }
    if (form.elements.scale) {
      for (const option of form.elements.scale.options) {
        try { scaleModifier(option.value, {mode, attribute: attributeValue(actor, values.attribute)}); option.disabled = false; }
        catch { option.disabled = true; }
      }
      if (form.elements.scale.selectedOptions[0]?.disabled) form.elements.scale.value = 'none';
    }
    try {
      const formula = options.kind === 'death' ? '2d6' : buildTestFormula(testComponents(actor, formValues(form), options));
      form.querySelector('[data-roll-preview]').textContent = formula;
    } catch (error) { form.querySelector('[data-roll-preview]').textContent = error.message; }
  };
  form.addEventListener('change', update);
  form.addEventListener('input', update);
  update();
}

async function dialogInput({title, template, data, render}) {
  const content = await renderTemplate(`${ROOT}/dialog/${template}.hbs`, data);
  return foundry.applications.api.DialogV2.wait({
    window: {title}, classes: ['nitro2d6', 'roll-dialog'], position: {width: 510},
    content, rejectClose: false, render,
    buttons: [
      {action: 'roll', label: 'Rolar', icon: 'fa-solid fa-dice', default: true,
        callback: (_event, button) => formValues(button.form)},
      {action: 'cancel', label: 'Cancelar', icon: 'fa-solid fa-xmark', callback: () => false}
    ]
  });
}

/** Roll an attribute, embedded skill, weapon, power, or a special character test. */
export async function rollTest(actor, {attribute = 'str', item = null, kind = 'test', label} = {}) {
  if (!actor) {
    ui.notifications.warn('Adicione este item à ficha de um personagem para usar seus atributos no teste.');
    return null;
  }
  try {
    if (!actor.isOwner) throw new Error('Você precisa controlar este personagem para rolar pela ficha.');
    if (item?.system.attribute) attribute = item.system.attribute;
    if (kind === 'initiative') attribute = 'dex';
    if (kind === 'sanity') attribute = attributeValue(actor, 'wis') >= attributeValue(actor, 'int') ? 'wis' : 'int';
    const skills = Array.from(actor.items).filter(entry => entry.type === 'skill').sort((a, b) => a.name.localeCompare(b.name));
    const selectedSkill = item?.type === 'skill' ? item : item?.type === 'weapon'
      ? skills.find(skill => skill.id === item.system.skill || normalize(skill.name) === normalize(item.system.skill)) : null;
    const specialLabels = {initiative: 'Iniciativa', death: 'Teste de morte', sanity: 'Teste de sanidade'};
    label ??= item?.name ?? specialLabels[kind] ?? ATTRIBUTES[attribute] ?? 'Teste';
    const options = {kind, item};
    const combatant = kind === 'initiative' ? findCombatant(actor) : null;
    const fixedRank = ['power', 'advantage', 'disadvantage'].includes(item?.type);
    const data = {
      label, actorName: actor.name, isDeath: kind === 'death', isInitiative: kind === 'initiative',
      isSanity: kind === 'sanity', regularTest: !['death', 'initiative'].includes(kind),
      showSkills: !fixedRank, rankLabel: fixedRank ? 'Graduação' : 'Perícia',
      rank: number(selectedSkill?.system.rank ?? (fixedRank ? item.system.rank : 0)),
      skills: skills.map(skill => ({value: skill.id, label: `${skill.name} (${signed(skill.system.rank)})`, selected: skill.id === selectedSkill?.id})),
      attributes: Object.entries(ATTRIBUTES).filter(([key]) => key !== 'pow' || actor.system.options?.power !== false)
        .map(([value, name]) => ({value, label: `${name} (${signed(attributeValue(actor, value))})`, selected: value === attribute})),
      occasions: OCCASION_MODIFIERS.map(value => ({value, label: value === 0 ? 'Sem modificador' : `${signed(value)} · ${Math.abs(value) === 2 ? 'Leve' : Math.abs(value) === 4 ? 'Média' : 'Grande'}`, selected: value === 0})),
      modes: visibilityModes(), narrative: number(actor.system.narrative?.value), action: number(actor.system.action?.value),
      canNarrative: number(actor.system.narrative?.value) > 0, canAction: number(actor.system.action?.value) > 0,
      isPower: item?.type === 'power' && actor.system.options?.power !== false,
      energyCost: number(item?.system.energyCost), energy: number(actor.system.energy?.value),
      fixedBonus: kind === 'initiative' ? number(actor.system.initiativeBonus) + number(actor.system.initiativeModifier)
        : item?.type === 'weapon' ? number(item.system.bonus) : 0,
      sanityBonus: sanityState(actor.system.sanity?.value, actor.system.sanity?.max).bonus,
      failures: number(actor.system.death?.failures), hasCombatant: !!combatant
    };
    const values = await dialogInput({title: `+2d6 · ${label}`, template: 'roll-dialog', data,
      render: (_event, dialog) => attachTestDialog(dialog, actor, options, skills)});
    if (!values) return null;
    return await withActorLock(actor, async () => {
      const components = testComponents(actor, values, options);
      const formula = kind === 'death' ? '2d6[Base]' : buildTestFormula(components);
      const resourceUpdates = resourceCosts(actor.system, {
        narrative: kind !== 'death' && values.narrative,
        action: kind !== 'death' && values.action,
        energyCost: item?.type === 'power' && values.spendEnergy ? Math.max(0, number(values.energyCost)) : 0
      });
      const mode = kind === 'initiative' ? 'initiative' : values.mode === 'opposed' ? 'opposed' : 'normal';
      const target = kind === 'death' ? 6 : mode === 'initiative' ? null
        : mode === 'opposed' ? (values.opponent === '' ? null : number(values.opponent)) : number(values.difficulty, 10);
      const roll = await new Roll(formula, actor.getRollData()).evaluate({allowInteractive: values.messageMode !== 'blind'});
      const baseDice = roll.dice[0]?.results.filter(result => result.active !== false).map(result => result.result).slice(0, 2) ?? [];
      const result = kind === 'death' ? resolveDeath({total: roll.total, baseDice, failures: actor.system.death?.failures})
        : resolveTest({total: roll.total, baseDice, mode, target});
      const updates = {...resourceUpdates};
      const notes = [];
      if (kind === 'death' && values.recordDeath) {
        updates['system.death.failures'] = result.failures;
        if (result.stabilized) updates['system.death.stabilized'] = true;
        notes.push(result.dead ? 'Três fracassos: personagem morto.' : result.stabilized ? 'Personagem estabilizado.' : `${result.failures}/3 fracassos de morte. Um sucesso comum não estabiliza.`);
      }
      if (kind === 'sanity' && result.outcome === 'failure') {
        const loss = Math.min(6, Math.max(1, number(values.sanityLoss, 1)));
        if (values.applySanity) updates['system.sanity.value'] = Math.max(0, number(actor.system.sanity?.value) - loss);
        notes.push(`Perda de ${loss} ponto${loss > 1 ? 's' : ''} de sanidade${values.applySanity ? ' registrada na ficha' : ' a aplicar'}.`);
      }
      if (values.narrative) notes.push('1 ponto narrativo gasto (+1d6). Máximo: um por cena.');
      if (values.action) notes.push('1 ponto de ação gasto (+2d6). Máximo: um por combate.');
      if (resourceUpdates['system.energy.value'] !== undefined) notes.push(`${number(values.energyCost)} PE gastos.`);
      if (result.critical) notes.push('As consequências do crítico são decididas pelo mestre. Dano dobrado é opcional.');
      if (kind === 'initiative') notes.push('Empates de iniciativa representam ações simultâneas.');
      const labels = {success: kind === 'death' ? 'Continua vivo' : 'Sucesso', failure: 'Fracasso',
        tie: 'Empate · sem vencedor', pending: kind === 'initiative' ? 'Iniciativa' : 'Aguardando oponente', stabilized: 'Estabilizado'};
      const breakdown = kind === 'death' ? '2d6 · CD 6'
        : `${ATTRIBUTES[kind === 'initiative' ? 'dex' : values.attribute]} ${signed(components.attribute)} · ${data.rankLabel.toLowerCase()} ${signed(components.rank)}${target === null ? '' : mode === 'opposed' ? ` · Oponente ${target}` : ` · CD ${target}`}`;
      const content = await renderTemplate(`${ROOT}/chat/roll-card.hbs`, {
        label, kindLabel: kind === 'initiative' ? 'INICIATIVA' : kind === 'death' ? 'SOBREVIVÊNCIA' : kind === 'sanity' ? 'SANIDADE' : mode === 'opposed' ? 'TESTE OPOSTO' : 'TESTE NORMAL',
        breakdown, outcome: result.outcome, outcomeLabel: labels[result.outcome], critical: result.critical,
        criticalLabel: result.critical === 'success' ? 'Acerto crítico · 6 + 6' : 'Falha crítica · 1 + 1',
        rollHTML: await roll.render(), notes
      });
      if (Object.keys(updates).length) await actor.update(updates);
      const message = await roll.toMessage({speaker: ChatMessage.getSpeaker({actor}), content,
        flags: {nitro2d6: {kind, itemId: item?.id ?? null, baseDice, target, mode, result}}}, {messageMode: values.messageMode});
      if (kind === 'initiative' && values.updateInitiative && combatant) await game.combat.setInitiative(combatant.id, roll.total);
      return {roll, message, result};
    });
  } catch (error) {
    console.error('Nitro +2d6 | Teste', error);
    ui.notifications.error(error.message);
    return null;
  }
}

/** Damage is separate from attack tests; doubling and the target's applicable RD are explicit choices. */
export async function rollDamage(actor, {item = null, formula, label} = {}) {
  try {
    if (actor && !actor.isOwner) throw new Error('Você precisa controlar este personagem para rolar pela ficha.');
    formula ??= item?.system.damage || actor?.system.strengthDamage || '1d6';
    label ??= item?.name ? `Dano · ${item.name}` : 'Dano';
    const target = game.user.targets.size === 1 ? game.user.targets.first() : null;
    const values = await dialogInput({title: `+2d6 · ${label}`, template: 'damage-dialog', data: {
      label, actorName: actor?.name, formula, damageType: ({lethal: 'Letal', nonlethal: 'Não letal'})[item?.system.damageType] || 'Letal',
      reduction: number(target?.actor?.system.totalReduction), targetName: target?.name, modes: visibilityModes()
    }});
    if (!values) return null;
    const rollData = actor?.getRollData() ?? {};
    const resolvedFormula = Roll.replaceFormulaData(values.formula, rollData, {recursive: true});
    if (!resolvedFormula.trim() || resolvedFormula.includes('@') || !Roll.validate(resolvedFormula)) {
      throw new Error('Fórmula de dano inválida. Use uma expressão como 1d6+2 ou @strengthDamage+1.');
    }
    const damageFormula = `(${resolvedFormula}) ${number(values.extra) < 0 ? '-' : '+'} ${Math.abs(number(values.extra))}`;
    const roll = await new Roll(damageFormula, rollData).evaluate({allowInteractive: values.messageMode !== 'blind'});
    const result = resolveDamage(roll.total, {reduction: values.reduction, multiplier: values.doubleDamage ? 2 : 1});
    const notes = [`${values.damageType || 'Dano'}. ${values.doubleDamage ? 'Dano dobrado por decisão do mestre. ' : ''}RD aplicada: ${Math.max(0, number(values.reduction))}.`,
      'Aplique o dano ao alvo conforme a proteção e o contexto da cena.'];
    const content = await renderTemplate(`${ROOT}/chat/roll-card.hbs`, {
      label, kindLabel: 'DANO', breakdown: `${values.doubleDamage ? 'Multiplicador ×2 · ' : ''}Dano antes da RD: ${result.multiplied}`,
      outcome: 'damage', outcomeLabel: `${result.final} de dano após RD`, rollHTML: await roll.render(), notes
    });
    const message = await roll.toMessage({speaker: ChatMessage.getSpeaker({actor}), content,
      flags: {nitro2d6: {kind: 'damage', itemId: item?.id ?? null, result, damageType: values.damageType}}}, {messageMode: values.messageMode});
    return {roll, message, result};
  } catch (error) {
    console.error('Nitro +2d6 | Dano', error);
    ui.notifications.error(error.message);
    return null;
  }
}
