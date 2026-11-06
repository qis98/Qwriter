const {test}=require('node:test');const assert=require('node:assert/strict');
const {configurationUrl,identify,mergeWhitelist,copiedSecret}=require('../src/configuration');
const id='wx0000000000000000';
test('configuration routes stay on official developer platform and bind visible identity',()=>{
  assert.equal(configurationUrl(),'https://developers.weixin.qq.com/platform/login');
  assert.deepEqual(identify(configurationUrl(id),id),{appId:id});
  assert.throws(()=>configurationUrl('javascript:alert(1)'));
  assert.throws(()=>identify(configurationUrl(id),'wx1111111111111111'));
  assert.throws(()=>identify('https://example.com/console/product/mp/'+id,id));
  assert.throws(()=>identify('https://developers.weixin.qq.com/platform/login',id));
});
test('IP preparation preserves all existing entries and refuses unrecognised values',()=>{
  const existing='192.0.2.1, 192.0.2.2\n192.0.2.3',merged=mergeWhitelist(existing,'192.0.2.4');
  assert.equal(merged.text,'192.0.2.1\n192.0.2.2\n192.0.2.3\n192.0.2.4');assert.equal(merged.count,4);
  assert.equal(mergeWhitelist(merged.text,'192.0.2.4').added,false);
  assert.throws(()=>mergeWhitelist('unknown','192.0.2.4'));assert.throws(()=>mergeWhitelist(existing,'999.0.0.1'));
});
test('clipboard import accepts only a dedicated secret value',()=>{
  assert.equal(copiedSecret('  '+'0'.repeat(32)+'\n'),'0'.repeat(32));
  assert.throws(()=>copiedSecret('AppSecret: '+'0'.repeat(32)));assert.throws(()=>copiedSecret('not-a-secret'));
});
