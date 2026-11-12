import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const products=[{id:'p1',name:'青菜',unit:'把',price_cents:1999,active:true,image_url:null},{id:'p2',name:'小葱',unit:'把',price_cents:10,active:true,image_url:null}];
const savedOrders=new Map();let role='admin';
const db={auth:{getUser:async()=>({data:{user:{id:'staff'}}})},rpc:async()=>({data:true}),from(table){
  let action='select',values,filters={},ids;
  function execute(single=false){
    if(table==='market_staff')return{data:{role,must_change:false,token_valid_after:0}};
    if(table==='market_ip_rules')return{data:null};
    if(table==='market_orders'){
      if(action==='insert'){savedOrders.set(values.id,structuredClone(values));return{data:null};}
      return{data:[...savedOrders.values()].find(o=>Object.entries(filters).every(([k,v])=>o[k]===v))||null};
    }
    if(table==='market_products'){
      if(action==='insert'){const p={id:'created',...values,active:true,image_url:null};products.push(p);return{data:p};}
      const matches=products.filter(p=>Object.entries(filters).every(([k,v])=>p[k]===v)&&(!ids||ids.includes(p.id)));
      if(action==='update')for(const p of matches)Object.assign(p,values);
      return{data:single?matches[0]:matches};
    }
    throw Error(table);
  }
  const query={select(){return query;},eq(k,v){filters[k]=v;return query;},in(_k,v){ids=v;return query;},insert(v){action='insert';values=v;return query;},update(v){action='update';values=v;return query;},order(){return query;},maybeSingle:async()=>execute(true),single:async()=>execute(true),then:(ok,bad)=>Promise.resolve(execute()).then(ok,bad)};
  return query;
}};
let handler;
let source=await readFile(new URL('./supabase/functions/market-api/index.ts',import.meta.url),'utf8');
source=stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm,''));
vm.runInNewContext(source,{createClient:()=>db,isIP:()=>4,Deno:{env:{get:()=> 'test'},serve:fn=>handler=fn},Response,Request,File,crypto,TextEncoder,Uint8Array,atob,console,AbortSignal,fetch:async()=>({ok:true,json:async()=>({base:'MXN',quote:'CNY',rate:0.35753,date:'2026-11-12'})})});
const token=`x.${btoa(JSON.stringify({iat:9999999999}))}.x`;
async function call(action,data={}){const r=await handler(new Request('https://example.invalid',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,'cf-connecting-ip':'192.0.2.1'},body:JSON.stringify({action,...data})}));return{status:r.status,...await r.json()};}
const base={id:crypto.randomUUID(),receipt:'ABCDE23456',customer:'测试',phone:'00000000',address:'非真实测试地址',region:'将军镇',fx_rate:0.35753,fx_date:'2026-11-12',items:[{id:'p1',quantity:3,unit_price_cents:1999},{id:'p2',quantity:7,unit_price_cents:10}],total_mxn_cents:1};
const created=await call('order',base);assert.equal(created.status,200,JSON.stringify(created));assert.equal(created.total_mxn_cents,6067);assert.equal(created.total_cny_cents,2173);
const snapshot=savedOrders.get(base.id);assert.equal(snapshot.items[0].line_total_mxn_cents,5997);assert.equal(snapshot.items[1].line_total_cny_cents,28);
products[0].price_cents=2500;
const retried=await call('order',base);assert.equal(retried.total_mxn_cents,6067,'Retry must retain original order prices');assert.equal(savedOrders.size,1);
assert.equal((await call('order',{...base,id:crypto.randomUUID()})).status,409,'Stale prices require review');
assert.equal((await call('order',{...base,id:crypto.randomUUID(),fx_rate:1})).status,409,'Client cannot supply a different exchange rate');
const lookedUp=await call('my-order',{receipt:base.receipt});assert.equal(lookedUp.order.total_mxn_cents,6067);assert.equal(lookedUp.order.items[0].unit_price_cents,1999);
products[0].price_cents=null;
assert.equal((await call('order',{...base,id:crypto.randomUUID()})).status,400,'Unpriced goods cannot create zero-price orders');
assert.equal((await call('save-product',{name:'测试',unit:'把',price:'1.234'})).status,400);
const edit=await call('save-product',{id:'p1',name:'修改后青菜',unit:'公斤',price:'25.50'});assert.equal(edit.status,200);assert.equal(products[0].name,'修改后青菜');assert.equal(products[0].unit,'公斤');assert.equal(products[0].price_cents,2550);
role='supplier';assert.equal((await call('save-product',{id:'p1',name:'不应修改',unit:'公斤',price:'1'})).status,403);
assert.equal(products[0].price_cents,2550);
console.log('PASS: integer MXN totals, per-unit CNY rounding, price/rate snapshots, retry safety, stale price protection, product editing and supplier restrictions');
