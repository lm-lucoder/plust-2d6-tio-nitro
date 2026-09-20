import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFoundryCommon, registerSystemModels} from './helpers/foundry-runtime.mjs';

const runtime = await loadFoundryCommon();

await test('Foundry data models and document integration', {
  skip: runtime ? false : 'Set FOUNDRY_PATH to run against an installed Foundry runtime.'
}, async t => {
  const models = await import('../module/data.mjs');
  const {actorDataModels, itemDataModels} = models;
  const manifest = await registerSystemModels(models);

  await t.test('every declared document type has a valid, independent schema', () => {
    assert.deepEqual(Object.keys(actorDataModels).sort(), Object.keys(manifest.documentTypes.Actor).sort());
    assert.deepEqual(Object.keys(itemDataModels).sort(), Object.keys(manifest.documentTypes.Item).sort());
    for (const Model of Object.values({...actorDataModels, ...itemDataModels})) {
      const model = new Model();
      assert.ok(model instanceof foundry.abstract.TypeDataModel);
      assert.equal(model.validate(), true);
      assert.deepEqual(new Model(model.toObject()).toObject(), model.toObject());
    }
  });

  await t.test('negative attributes and dying characters survive cleaning and serialization', () => {
    const actor = new actorDataModels.npc({
      attributes: {str: {value: '-3'}, con: {value: -2}},
      health: {value: -4, max: 1, automatic: false}, challenge: 0
    });
    assert.equal(actor.attributes.str.value, -3);
    assert.equal(actor.health.value, -4);
    assert.equal(actor.health.max, 1);
    const restored = new actorDataModels.npc(JSON.parse(JSON.stringify(actor)));
    assert.equal(restored.health.value, -4);
    assert.equal(restored.attributes.con.value, -2);
  });

  await t.test('resource bounds are cleaned while malformed attributes are rejected', () => {
    const actor = new actorDataModels.character({energy: {value: -2}, death: {failures: 7}});
    assert.equal(actor.energy.value, 0);
    assert.equal(actor.death.failures, 3);
    assert.throws(() => new actorDataModels.character({attributes: {str: {value: 'invalid'}}}), /must be a number/);
    assert.throws(() => new itemDataModels.skill({attribute: 'invalid'}), /not a valid choice/);
  });

  await t.test('physical item quantities and fractional weights retain inventory meaning', () => {
    const weapon = new itemDataModels.weapon({quantity: 0, weight: 0.25, ammunition: {value: 3, max: 6}});
    assert.equal(weapon.quantity, 0);
    assert.equal(weapon.weight, 0.25);
    assert.equal(weapon.ammunition.value, 3);
    const second = new itemDataModels.weapon();
    weapon.ammunition.value = 1;
    assert.equal(second.ammunition.value, 0);
    assert.equal(weapon.toObject().ammunition.value, 3);
  });

  await t.test('real Actor documents embed Items with their registered type models', () => {
    const actor = new foundry.documents.BaseActor({
      name: 'Teste de integração', type: 'character',
      items: [{_id: 'testskill0000001', name: 'Investigação', type: 'skill', system: {rank: 3, attribute: 'int'}}]
    });
    assert.ok(actor.system instanceof actorDataModels.character);
    assert.equal(actor.items.size, 1);
    const skill = actor.items.contents[0];
    assert.ok(skill.system instanceof itemDataModels.skill);
    assert.equal(skill.system.rank, 3);
    assert.equal(skill.parent, actor);
    assert.equal(skill.system.parent, skill);
    const exported = actor.toObject();
    assert.equal(exported.items[0].system.attribute, 'int');
  });
});
