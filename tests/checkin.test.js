const {test}=require('node:test'),assert=require('node:assert/strict');
const {chinaDay,accountKey,isComplete,checkinSummary}=require('../src/checkin');
test('model cooling does not prevent account check-in',()=>{const {eligibleAccounts}=require('../src/checkin');assert.equal(eligibleAccounts([{cooling:true,realm:'cn'}]).length,1);assert.equal(eligibleAccounts([{disabled:true},{realm:'global'}]).length,0);});
test('daily boundary follows China time',()=>{assert.equal(chinaDay(Date.parse('2026-11-05T16:00:00Z')),'2026-11-06');assert.equal(chinaDay(Date.parse('2026-11-05T15:59:59Z')),'2026-11-05');});
test('only verified success suppresses repeat claims',()=>{assert.equal(isComplete({status:'ERROR'}),false);assert.equal(isComplete({status:'INACTIVE'}),false);assert.equal(isComplete({status:'ALREADY'}),true);assert.equal(accountKey('a'),accountKey('a'));assert.notEqual(accountKey('a'),accountKey('b'));assert.match(checkinSummary({items:[{status:'ERROR'}]}),/未确认/);});
