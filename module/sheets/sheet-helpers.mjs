import { NITRO2D6 } from '../helpers/config.mjs';

export const signed = value => Number(value ?? 0) >= 0 ? `+${Number(value ?? 0)}` : String(value);

export async function enrich(content, document) {
  return foundry.applications.ux.TextEditor.implementation.enrichHTML(content ?? '', {
    secrets: document.isOwner, relativeTo: document, rollData: document.getRollData()
  });
}

/** Presentation-only item summaries; all mechanics stay in document and dice classes. */
export function itemView(item) {
  const view = item.toObject(false);
  const system = item.system;
  view.id = item.id;
  view.canRoll = ['skill', 'weapon', 'power'].includes(item.type) || Boolean(system.rollable);
  view.canDamage = ['weapon', 'power'].includes(item.type) && Boolean(system.damage);
  view.physical = ['weapon', 'armor', 'equipment'].includes(item.type);
  view.attribute = NITRO2D6.abbreviations[system.attribute] ?? '';
  view.rankLabel = signed(system.rank ?? system.bonus ?? 0);
  view.badges = [];
  switch (item.type) {
    case 'skill':
      view.subtitle = system.specialization || NITRO2D6.attributes[system.attribute];
      view.badges = [view.attribute, view.rankLabel];
      break;
    case 'weapon':
      view.subtitle = [system.skill, system.range].filter(Boolean).join(' · ') || NITRO2D6.attributes[system.attribute];
      view.badges = [system.damage, NITRO2D6.damageTypes[system.damageType]].filter(Boolean);
      break;
    case 'armor':
      view.subtitle = `${system.quantity} un. · ${system.weight} kg`;
      view.badges = [`RD ${system.reduction}`];
      break;
    case 'equipment':
      view.subtitle = `${system.quantity} un. · ${system.weight} kg`;
      if (system.bonus) view.badges = [`Bônus ${signed(system.bonus)}`];
      break;
    case 'power':
      view.subtitle = [system.category === 'magic' ? 'Magia' : 'Poder', NITRO2D6.attributes[system.attribute], system.range].filter(Boolean).join(' · ');
      view.badges = [`Grau ${system.rank}`, `${system.energyCost} PE`];
      break;
    default:
      view.subtitle = system.source || (item.type === 'advantage' ? 'Recurso do personagem' : 'Complicação do personagem');
      view.badges = [`${system.cost} pontos`];
      if (system.rollable) view.badges.push(`${view.attribute} ${view.rankLabel}`);
  }
  return view;
}
