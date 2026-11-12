// Run only against a new/staging project; this creates disposable acceptance orders.
import assert from 'node:assert/strict';
import {API_URL} from './dist/config.js';
const call=async(action,data={},token='',extra={})=>{const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{}) ,...extra},body:JSON.stringify({action,...data})});const raw=await r.text();if(!r.headers.get('content-type')?.includes('application/json'))throw new Error(`${action}: HTTP ${r.status} returned non-JSON: ${raw.slice(0,150)}`);return {status:r.status,...JSON.parse(raw)};};
const code=()=>{const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from(crypto.getRandomValues(new Uint8Array(10)),v=>a[v%32]).join('');};
const admin=await call('login',{username:'admin',password:process.env.TEST_ADMIN_PASSWORD});
assert.equal(admin.status,200);assert.equal(admin.role,'admin');
if(process.env.TEST_PHASE==='gate'){
  assert.equal(admin.must_change,true);
  assert.equal((await call('orders',{},admin.token)).status,403);
  assert.equal((await call('save-product',{name:'不得写入',unit:'把'},admin.token)).status,403);
  assert.equal((await call('password',{current:'wrong',password:'Changed987'},admin.token)).status,400);
  console.log('PASS: initial password gate and old-password validation');
}else{
  const p=await call('products');assert.equal(p.status,200);assert.ok(p.products.length);
  assert.equal((await call('orders')).status,401);
  assert.equal((await call('my-order',{receipt:code()})).status,404);
  const product=p.products[0];
  const base={customer:'验收测试-可删除',phone:'0000000000',address:'验收地址-非真实客户',region:'将军镇',items:[{id:product.id,quantity:2}]};
  assert.equal((await call('order',{...base,id:crypto.randomUUID(),receipt:code(),items:[{id:product.id,quantity:-1}]})).status,400);
  const created=[];
  for(let i=0;i<4;i++){
    const receipt=code(),id=crypto.randomUUID();
    const result=await call('order',{...base,id,receipt});
    assert.equal(result.status,200,JSON.stringify(result));created.push({receipt,id});
  }
  assert.equal((await call('order',{...base,...created[0]})).status,200,'idempotent submission');
  assert.equal((await call('my-order',{receipt:created[0].receipt})).order.id,created[0].id);
  let r=await call('cancel-order',{receipt:created[0].receipt});assert.equal(r.streak,1,JSON.stringify(r));
  r=await call('cancel-order',{receipt:created[0].receipt});assert.equal(r.already_cancelled,true);
  r=await call('cancel-order',{receipt:created[1].receipt});assert.equal(r.streak,2);
  r=await call('cancel-order',{receipt:created[2].receipt});assert.equal(r.streak,3);assert.equal(r.blocked,true);
  assert.equal((await call('products')).status,403);
  assert.equal((await call('order',{...base,id:crypto.randomUUID(),receipt:code()})).status,403);
  assert.equal((await call('my-order',{receipt:created[0].receipt})).status,403);
  assert.equal((await call('orders',{},admin.token)).status,403,'admin first-login gate remains enforced');
  console.log('PASS: input validation, private receipt lookup, retry idempotency, repeat cancellation, three-cancellation IP block');
}
