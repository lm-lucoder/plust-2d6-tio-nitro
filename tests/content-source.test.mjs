import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadFoundryCommon, registerSystemModels} from './helpers/foundry-runtime.mjs';

const runtime = await loadFoundryCommon();
const expectedCounts = {
  skills: 118, advantages: 83, disadvantages: 131, powers: 201,
  weapons: 76, armors: 31, equipment: 1, npcs: 16, rules: 18
};

await test('content source contains native Foundry V14 document sources', {
  skip: runtime ? false : 'Set FOUNDRY_PATH to run against an installed Foundry runtime.'
}, async t => {
  const models = await import('../module/data.mjs');
  await registerSystemModels(models);
  const catalog = JSON.parse(await readFile(new URL('../nitro2d6-content.json', import.meta.url), 'utf8'));
  assert.equal(catalog.format, 'nitro2d6-content-source');
  assert.equal(catalog.foundry.generation, 14);
  const packs = Object.fromEntries(catalog.packs.map(pack => [pack.key, pack]));
  assert.deepEqual(Object.keys(packs).sort(), Object.keys(expectedCounts).sort());
  for (const [key, count] of Object.entries(expectedCounts)) assert.equal(packs[key].documents.length, count, `${key} must retain every extracted entry`);

  await t.test('Item sources validate using the registered system data models', () => {
    const sources = catalog.packs.filter(pack => pack.documentName === 'Item').flatMap(pack => pack.documents);
    const ids = sources.map(source => source._id);
    assert.equal(new Set(ids).size, ids.length, 'each Item source must have a unique Foundry ID');
    const actor = new foundry.documents.BaseActor({name: 'Validação de catálogo', type: 'npc', items: sources});
    assert.equal(actor.items.size, sources.length);
    for (const item of actor.items) assert.equal(item.system.validate(), true, item.name);
    for (const source of sources.filter(source => ['weapon', 'power'].includes(source.type) && source.system.damage)) {
      assert.match(source.system.damage, /^(@strengthDamage|\d+d\d+|\d+)([+-]\d+)?$/, `${source.name} needs a rollable damage formula`);
    }
  });

  await t.test('Actor sources and their embedded Items validate', () => {
    const actors = packs.npcs.documents;
    for (const source of actors) {
      const actor = new foundry.documents.BaseActor(source);
      assert.equal(actor.system.validate(), true, source.name);
      assert.equal(actor.items.size, source.items.length, source.name);
      for (const item of actor.items) assert.equal(item.system.validate(), true, `${source.name}: ${item.name}`);
    }
  });

  await t.test('JournalEntry sources validate as standard Foundry documents', () => {
    CONFIG.JournalEntry = {dataModels: {}};
    CONFIG.JournalEntryPage = {dataModels: {}};
    game.model.JournalEntry = {};
    game.model.JournalEntryPage = {text: {}, pdf: {}};
    for (const source of packs.rules.documents) {
      const journal = new foundry.documents.BaseJournalEntry(source);
      assert.equal(journal.pages.size, source.pages.length, source.name);
    }
  });
});
