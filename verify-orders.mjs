import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

const orderId='11111111-1111-4111-8111-111111111111';
let role='admin',mustChange=false,authValid=true,order={id:orderId,status:'pending'},writes=0;
const db={rpc:async()=>({data:true}),auth:{getUser:async()=>({data:{user:authValid?{id:'staff-id'}:null},error:authValid?null:new Error()})},from(table){
  let update,fields,filters={};
  const query={select(v){fields=v;return query;},eq(k,v){filters[k]=v;return query;},update(v){update=v;return query;},order(){return query;},range(){return query;},
    async maybeSingle(){
      if(table==='market_staff')return{data:role?{role,must_change:mustChange,token_valid_after:0}:null};
      if(table==='market_ip_rules')return{data:null};
      if(table==='market_orders'){
        if(update){if(order.id!==filters.id||order.status!==filters.status)return{data:null};Object.assign(order,update);writes++;return{data:{id:order.id}};}
        assert.ok(fields.includes('rejection_reason'));assert.ok(fields.includes('rejected_at'));
        return{data:{...order}};
      }
      throw Error(table);
    }};return query;
}};
let handler;
let backend=await readFile(new URL('./supabase/functions/market-api/index.ts',import.meta.url),'utf8');
backend=stripTypeScriptTypes(backend.replace(/^import .*;\r?\n/gm,''));
vm.runInNewContext(backend,{createClient:()=>db,isIP:()=>4,Deno:{env:{get:()=> 'test-only'},serve:fn=>handler=fn},Response,Request,File,crypto,TextEncoder,Uint8Array,atob,console});
const token=`x.${btoa(JSON.stringify({iat:9999999999}))}.x`;
async function call(action,data={},signed=true){const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':'192.0.2.1',...(signed?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({action,...data})}));return{status:response.status,...await response.json()};}
assert.equal((await call('reject-order',{id:orderId,reason:'缺货'},false)).status,401);
authValid=false;assert.equal((await call('reject-order',{id:orderId,reason:'缺货'})).status,401);authValid=true;
role=null;assert.equal((await call('reject-order',{id:orderId,reason:'缺货'})).status,403);role='admin';
mustChange=true;assert.equal((await call('reject-order',{id:orderId,reason:'缺货'})).status,403);mustChange=false;
assert.equal((await call('reject-order',{id:orderId,reason:'   '})).status,400);
assert.equal((await call('reject-order',{id:orderId,reason:'长'.repeat(501)})).status,400);assert.equal(writes,0);
for(const value of ['admin','supplier']){
  role=value;order={id:orderId,status:'pending'};
  assert.equal((await call('reject-order',{id:orderId,reason:'  该区域暂时无法配送  '})).status,200);
  assert.equal(order.status,'rejected');assert.equal(order.rejection_reason,'该区域暂时无法配送');assert.equal(order.rejected_by,'staff-id');assert.ok(order.rejected_at);
  assert.equal((await call('my-order',{receipt:'ABCDE23456'},false)).order.rejection_reason,'该区域暂时无法配送');
}
for(const status of ['rejected','cancelled','fulfilled']){order={id:orderId,status};assert.equal((await call('reject-order',{id:orderId,reason:'不能覆盖'})).status,409);assert.equal(order.status,status);}

const elements=new Map(),handlers={};
const element=s=>{if(!elements.has(s))elements.set(s,{innerHTML:'',textContent:'',hidden:false,scrollIntoView(){},close(){}});return elements.get(s);};
const item={id:'p',name:'青菜',unit:'把',quantity:2};
const pending={id:orderId,status:'pending',customer:'测试客户',phone:'1234567890',address:'测试地址',region:'将军镇',items:[item],created_at:new Date().toISOString(),receipt_code:'ABCDE23456'};
const rejected={...pending,id:'other-id',status:'rejected',rejection_reason:'缺货 <script>alert(1)</script>',items:[{...item,quantity:100}]};
const context=vm.createContext({API_URL:'https://example.invalid',FormData,URL,AbortSignal,crypto,document:{querySelector:element,addEventListener:(k,v)=>handlers[k]=v},window:{addEventListener(){}},location:{hash:'#admin'},localStorage:{getItem:()=>null,setItem(){}},sessionStorage:{getItem:()=>null},setTimeout:()=>0,clearTimeout(){},fetch:async(_url,options)=>({ok:true,json:async()=>JSON.parse(options.body).action==='orders'?{orders:[pending,rejected]}:{order:rejected}})});
let frontend=await readFile(new URL('./dist/app.js',import.meta.url),'utf8');frontend=frontend.replace(/^\uFEFF?import .*\r?\n/,'').replace(/boot\(\);\s*$/,'');vm.runInContext(frontend,context);
await vm.runInContext("staff={role:'admin'};statusFilter='';renderOrders()",context);
const html=element('#admin-content').innerHTML;
assert.ok(html.includes('order-contact'));assert.ok(html.includes('1234567890'));
assert.ok(html.includes('<details class="order-card order-fold"><summary>'));
assert.ok(!html.includes('<details class="order-card order-fold" open'),'Orders start collapsed');
assert.ok(html.includes('展开明细'));assert.ok(html.includes('收起明细'));
assert.ok(html.includes('<td><b>2</b></td>'));assert.ok(!html.includes('<td><b>102</b></td>'),'Rejected orders must not add to preparation totals');
assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
await vm.runInContext("lookup('ABCDE23456')",context);
const customerHTML=element('#my-order-result').innerHTML;
assert.ok(customerHTML.includes('已拒绝配送'));assert.ok(customerHTML.includes('缺货 &lt;script&gt;'));assert.ok(!customerHTML.includes('data-action="cancel-order"'));
assert.ok(!/未收取付款|尚未付款|不进行在线付款/.test(frontend),'Remove payment notices from customer UI');
console.log('PASS: admin/supplier rejection, mandatory reason, status conflicts, private lookup, contact display, safe reason rendering, preparation totals');
