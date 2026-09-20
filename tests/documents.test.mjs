import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFoundryCommon, registerSystemModels} from './helpers/foundry-runtime.mjs';

const runtime = await loadFoundryCommon();
await test('Actor derived values and formula data use real Foundry models', {
  skip: runtime ? false : 'Set FOUNDRY_PATH to use an installed Foundry runtime.'
}, async t => {
  const models = await import('../module/data.mjs');
  await registerSystemModels(models);
  // Only the client lifecycle is supplied here; schema and embedded documents are real Foundry classes.
  globalThis.Actor = class extends foundry.documents.BaseActor {prepareDerivedData() {}};
  const {Nitro2d6Actor} = await import('../module/documents/actor.mjs');
  const actor = new Nitro2d6Actor({name:'Investigadora',type:'character',system:{
    attributes:{str:{value:3},con:{value:4},dex:{value:6},int:{value:4},wis:{value:3},pow:{value:2}},
    health:{value:10},damageReduction:1
  },items:[
    {_id:'armor00000000001',name:'Armadura',type:'armor',system:{reduction:4,equipped:true,weight:3}},
    {_id:'armor00000000002',name:'Colete',type:'armor',system:{reduction:3,equipped:true,weight:1}},
    {_id:'armor00000000003',name:'Não carregada',type:'armor',system:{reduction:10,equipped:true,quantity:0}},
    {_id:'skill00000000001',name:'História',type:'skill',system:{rank:3,academic:true}},
    {_id:'skill00000000002',name:'Conhecimento',type:'skill',system:{rank:5,academic:true}},
    {_id:'skill00000000003',name:'Briga',type:'skill',system:{rank:8,academic:false}}
  ]});
  actor.prepareDerivedData();
  await t.test('resources include printed Constitution and the highest academic skill only', () => {
    assert.equal(actor.system.health.max,27);
    assert.equal(actor.system.health.value,10);
    assert.equal(actor.system.energy.max,12);
    assert.equal(actor.system.sanity.max,22);
    assert.equal(actor.system.totalReduction,5);
    assert.equal(actor.system.totalWeight,4);
    assert.equal(actor.system.initiativeBonus,6);
  });
  await t.test('formulas retain derived fields without exposing mutable actor state', () => {
    const data=actor.getRollData();
    assert.equal(data.initiativeBonus,6);
    assert.equal(data.strengthDamage,'1d6');
    data.attributes.str.value=999;
    data.attributeBonus.wis=999;
    data.health.max=999;
    assert.equal(actor.system.attributes.str.value,3);
    assert.equal(actor.system.attributeBonus.wis,1);
    assert.equal(actor.system.health.max,27);
  });
  await t.test('manual maxima remain stable when derived data is recalculated', () => {
    actor.system.health.automatic=false;
    actor.system.health.max=85;
    actor.system.options.heroic=true;
    actor.prepareDerivedData();
    assert.equal(actor.system.health.max,85);
    assert.equal(actor.system.health.value,10);
    assert.equal(actor.system.sanity.max,32);
  });
});
