// Regression: a form field named "id" must not stop product submissions.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
let source=await readFile(new URL('./dist/app.js',import.meta.url),'utf8');
source=source.replace(/^\uFEFF?import .*\r?\n/,'').replace(/boot\(\);\s*$/,'');
const handlers={},requests=[];
const elements=new Map();
const element=s=>{if(!elements.has(s))elements.set(s,{innerHTML:'',textContent:'',hidden:false});return elements.get(s);};
const fields={id:'',name:'回归测试商品',unit:'把',price:'25.50',image:{size:0,type:''}};
class FormDataMock{constructor(form){this.fields=new Map(Object.entries(form.fields));}entries(){return this.fields.entries();}[Symbol.iterator](){return this.entries();}get(key){return this.fields.get(key);}set(k,v){this.fields.set(k,v);}}
const button={disabled:false,textContent:'新增商品'};
const form={id:{value:''},fields,getAttribute:()=> 'product-form',querySelector:()=>button};
const context={
  API_URL:'https://example.invalid',FormData:FormDataMock,URL,AbortSignal,crypto,
  document:{querySelector:element,addEventListener:(name,handler)=>handlers[name]=handler},
  window:{addEventListener(){}},location:{hash:'#admin'},
  localStorage:{getItem:()=>null,setItem(){}},sessionStorage:{getItem:()=>null},
  setTimeout:()=>0,clearTimeout(){},
  fetch:async(_url,options)=>{requests.push(options);return{ok:true,json:async()=>options.body instanceof FormDataMock?{ok:true}:{products:[{id:'test',name:fields.name,unit:fields.unit,image_url:null}]}};}
};
vm.runInNewContext(source,context);
await handlers.submit({target:form,preventDefault(){}});
assert.equal(requests.length,2,'Submitting must save the product and reload the catalogue, even when the form has a named id field');
assert.equal(button.disabled,false);
assert.ok(element('#admin-content').innerHTML.includes(fields.name));
assert.equal(element('#toast').textContent,'商品已保存');
assert.ok(requests[0].body instanceof FormDataMock,'Files must be sent as multipart data');
assert.equal(requests[0].headers['Content-Type'],undefined,'Browser must set the multipart boundary');
requests.length=0;fields.id='existing-product';fields.name='修改后的已有商品';
await handlers.submit({target:form,preventDefault(){}});
assert.equal(requests[0].body.get('id'),'existing-product');assert.equal(requests[0].body.get('price'),'25.50');
vm.runInNewContext("renderProductAdmin({id:'existing-product',name:'已有商品',unit:'公斤',price_cents:2550})",context);
assert.ok(element('#admin-content').innerHTML.includes('value="25.50"'));
vm.runInNewContext("staff={role:'supplier'};renderProductAdmin()",context);
assert.ok(!element('#admin-content').innerHTML.includes('id="product-form"'),'Supplier catalogue is read-only');
const totals=vm.runInNewContext("fx={rate:0.35753,date:'2026-11-12'};products=[{id:'a',price_cents:1999},{id:'b',price_cents:10}];cart={a:3,b:7};cartAmount()",context);
assert.equal(totals.mxn,6067);assert.equal(totals.cny,2173);
requests.length=0;fields.image={size:6*1024*1024,type:'image/png'};
await handlers.submit({target:form,preventDefault(){}});
assert.equal(requests.length,0,'Oversized images must not be submitted');
assert.equal(element('#toast').textContent,'图片不能超过5MB');
assert.equal(button.disabled,false);
console.log('PASS: product submission with an id field saves and refreshes the catalogue');
