import assert from 'node:assert/strict';
import {test} from 'node:test';
import {numberedTeamName,normalizeTeamText,sortProducts,groupClientStops,buildSavRows,normalizeSav,validateCustomer} from '../lib/depot-domain.ts';

test('old teams use numeric labels while preserving custom names and registrations',()=>{
 assert.equal(numberedTeamName('Équipe A'),'Équipe 1');
 assert.equal(numberedTeamName('Équipe 1 – Équipe A'),'Équipe 1');
 assert.equal(normalizeTeamText('TOTAL / Équipe A / Équipe 1'),'TOTAL / Équipe 1');
 assert.equal(normalizeTeamText('AZ-123-CD'),'AZ-123-CD');
 assert.equal(numberedTeamName('Aziz'),'Aziz');
});
test('materials sorted by activity then reference without changing source order',()=>{
 const products=[{id:'pv',activity:'PV',brand:'A'},{id:'pac2',activity:'PAC',brand:'Z'},{id:'conso',activity:'CONSOMMABLES',brand:'Y'},{id:'pac1',activity:'PAC',brand:'A'}];
 assert.deepEqual(sortProducts(products).map(p=>p.id),['conso','pac1','pac2','pv']);
 assert.equal(products[0].id,'pv');
});
test('late material stays next to same customer while visit order is preserved',()=>{
 const stops=[{id:'a1',customerId:'a'},{id:'b1',customerId:'b'},{id:'a2',customerId:'a'}];
 assert.deepEqual(groupClientStops(stops).map(s=>s.id),['a1','a2','b1']);
});
test('SAV from client dossier appears with and without a route, once per client',()=>{
 const customers=[{id:'c',status:'SAV à programmer'},{id:'d',status:'SAV en cours de traitement'}];
 const stops=[{id:'s1',customerId:'c',productId:'p',savStatus:'Aucun'},{id:'s2',customerId:'c',productId:'q',savStatus:'Aucun'}];
 const rows=buildSavRows({customers,stops,products:[{id:'p',brand:'PAC',model:'10'},{id:'q',brand:'PV',model:'500'}]});
 assert.equal(rows.length,2);assert.equal(rows[0].savStatus,'SAV à programmer');assert.equal(rows[0].productNames.length,2);assert.equal(rows[1].customerId,'d');
 const closed=buildSavRows({customers:[{id:'c',status:'SAV traité'}],stops:[{...stops[0],savStatus:'SAV à traiter'}],products:[]});
 assert.equal(closed[0].savStatus,'SAV traité');assert.equal(normalizeSav('SAV à traiter'),'SAV à programmer');
});
test('all six contact fields must be present and postcode stays a five digit string',()=>{
 const valid={lastName:'Martin',firstName:'Robert',phone:'0612345678',address:'1 rue du Test',city:'Nice',postalCode:'06000'};
 assert.equal(validateCustomer(valid),null);
 for(const key of Object.keys(valid))assert.ok(validateCustomer({...valid,[key]:'  '}));
 assert.ok(validateCustomer({...valid,postalCode:'06000 Nice'}));
 assert.ok(validateCustomer({...valid,postalCode:'6000'}));
});
