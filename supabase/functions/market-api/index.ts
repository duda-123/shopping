import { createClient } from 'npm:@supabase/supabase-js@2.80.0';
import { isIP } from 'node:net';

const url = Deno.env.get('SUPABASE_URL')!;
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const regions = ['将军镇','华富山','波瓦达波','机场','阿波达卡'];
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control':'no-store' } });
function fail(message: string): never { throw new Error(message); }
function check(result: any) { if (result.error) { console.error(result.error); fail('操作失败，请稍后重试'); } return result.data; }
function text(value: unknown, min: number, max: number) { if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail('请检查填写内容的长度'); return value.trim(); }
function username(value: unknown) { const v = text(value, 3, 30).toLowerCase(); if (!/^[a-z][a-z0-9_-]*$/.test(v)) fail('账号须以字母开头，仅含字母、数字、下划线或短横线'); return v; }
function password(value: unknown) { const v = text(value, 8, 128); if (!/[a-zA-Z]/.test(v) || !/[0-9]/.test(v)) fail('密码至少8位，包含字母和数字'); return v; }
const email = (name: string) => `${name}@market.internal`;
async function receiptHash(value: unknown) {
  const code=text(value,10,11).replace(/-/g,'').toUpperCase();
  if(!/^[A-HJ-NP-Z2-9]{10}$/.test(code)) fail('请输入10位字母数字查询码');
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code.toLowerCase()))),v=>v.toString(16).padStart(2,'0')).join('');
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: '请求方式不支持' }, 405);
  try {
    if (Number(req.headers.get('content-length') || 0) > 64000) return reply({ error: '请求过大' }, 413);
    const b = await req.json();
    // Hosted Supabase ingress runs behind Cloudflare. Never trust a caller's XFF prefix.
    const rawIp=req.headers.get('cf-connecting-ip')?.trim()||'';
    const ip=isIP(rawIp)?rawIp:'unknown';
    if(ip==='unknown' && ['order','my-order','cancel-order'].includes(b.action)) return reply({error:'无法验证当前网络，请稍后再试'},503);
    const ipBytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));
    const ipHash=Array.from(new Uint8Array(ipBytes),v=>v.toString(16).padStart(2,'0')).join('');
    if(['login','order','my-order','cancel-order'].includes(b.action)) {
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${b.action}:${ip}`));
      const key=Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
      const allowed=check(await db.rpc('market_rate_limit',{bucket_key:key,allowed_hits:b.action==='order'?10:20}));
      if(!allowed) return reply({error:'操作过于频繁，请一分钟后重试'},429);
    }
    if(['products','order','my-order'].includes(b.action)) {
      const rule=check(await db.from('market_ip_rules').select('blocked').eq('ip_hash',ipHash).maybeSingle());
      if(rule?.blocked) {
        const bearer=req.headers.get('Authorization')?.replace(/^Bearer /i,'');
        const auth=bearer?await db.auth.getUser(bearer):null;
        const staff=auth?.data.user?check(await db.from('market_staff').select('role').eq('user_id',auth.data.user.id).maybeSingle()):null;
        if(!staff || b.action==='order' || b.action==='my-order') return reply({error:'此网络因连续取消3次订单已被限制，请联系管理员解除封锁'},403);
      }
    }
    if (b.action === 'products') return reply({ products: check(await db.from('market_products').select('id,name,unit').eq('active', true).order('created_at')) });
    if (b.action === 'my-order') {
      const hash=await receiptHash(b.receipt);
      const order=check(await db.from('market_orders').select('id,customer,phone,address,region,items,created_at,status').eq('receipt_hash',hash).maybeSingle());
      if(!order) return reply({error:'未找到订单，请检查专属查询码'},404);
      return reply({order});
    }
    if(b.action==='cancel-order') {
      const result=check(await db.rpc('market_cancel_order',{code_hash:await receiptHash(b.receipt)}));
      return reply(result);
    }
    if (b.action === 'login') {
      const name = username(b.username);
      const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client.auth.signInWithPassword({ email: email(name), password: text(b.password, 1, 128) });
      if (error || !data.user) return reply({ error: '账号或密码错误' }, 401);
      const staff = check(await db.from('market_staff').select('role,username,must_change').eq('user_id', data.user.id).maybeSingle());
      if (!staff) return reply({ error: '此账号没有后台权限' }, 403);
      return reply({ token: data.session.access_token, ...staff });
    }
    if (b.action === 'order') {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.id || '')) fail('订单编号无效');
      const order = { id: b.id, receipt_code:text(b.receipt,10,11).replace(/-/g,'').toUpperCase(), receipt_hash:await receiptHash(b.receipt), ip_hash:ipHash, customer: text(b.customer,1,60), phone: text(b.phone,5,40), address: text(b.address,5,300), region: b.region, items: [] as any[] };
      if (!regions.includes(b.region) || !Array.isArray(b.items) || b.items.length < 1 || b.items.length > 100) fail('请选择区域及商品');
      const ids = b.items.map((i: any) => i.id);
      if (new Set(ids).size !== ids.length) fail('商品不能重复');
      const products = check(await db.from('market_products').select('id,name,unit').eq('active',true).in('id',ids));
      for (const item of b.items) {
        const p = products.find((p: any) => p.id === item.id);
        if (!p || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) fail('商品已下架或数量无效，请刷新商品');
        order.items.push({ ...p, quantity: item.quantity });
      }
      const result = await db.from('market_orders').insert(order);
      // A retry with the same UUID never creates a duplicate or reads customer data.
      if (result.error?.code === '23505') {
        const existing=check(await db.from('market_orders').select('id').eq('id',b.id).eq('receipt_hash',order.receipt_hash).maybeSingle());
        if(!existing) fail('订单编号冲突，请重新提交');
      } else check(result);
      return reply({ id: b.id });
    }
    const token = req.headers.get('Authorization')?.replace(/^Bearer /i,'');
    if (!token) return reply({ error: '请先登录' }, 401);
    const { data: { user }, error } = await db.auth.getUser(token);
    if (error || !user) return reply({ error: '登录已过期，请重新登录' }, 401);
    const staff = check(await db.from('market_staff').select('*').eq('user_id',user.id).maybeSingle());
    if (!staff) return reply({ error: '无后台权限' }, 403);
    const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    if (claims.iat <= staff.token_valid_after) return reply({error:'密码已修改，请重新登录'},401);
    if (b.action === 'me') return reply({ role: staff.role, username: staff.username, must_change: staff.must_change });
    if (b.action === 'password') {
      const next = password(b.password);
      const verify = createClient(url, secret, { auth: { persistSession:false, autoRefreshToken:false } });
      const previous = text(b.current,1,128);
      if (previous === next) fail('新密码不能与原密码相同');
      const old = await verify.auth.signInWithPassword({ email: email(staff.username), password: previous });
      if (old.error) return reply({ error: '原密码错误' }, 400);
      check(await db.auth.admin.updateUserById(user.id,{ password: next }));
      check(await db.from('market_staff').update({must_change:false,token_valid_after:Math.floor(Date.now()/1000)}).eq('user_id',user.id));
      return reply({ ok:true });
    }
    if (staff.must_change) return reply({ error:'请先修改初始密码' },403);
    if(b.action==='fulfill-order') { check(await db.rpc('market_fulfill_order',{order_id:b.id}));return reply({ok:true}); }
    if (b.action === 'orders') {
      if (b.region && !regions.includes(b.region)) fail('区域无效');
      // Paginate past the Data API default limit; never silently omit orders.
      let orders: any[] = [];
      for (let start=0;;start+=500) {
        const fields='id,customer,phone,address,region,items,created_at,status'+(staff.role==='admin'?',receipt_code,ip_hash':'');
        let query = db.from('market_orders').select(fields).order('created_at',{ascending:false}).order('id').range(start,start+499);
        if (b.region) query=query.eq('region',b.region);
        const page=check(await query); orders.push(...page); if(page.length<500) break;
      }
      return reply({ orders });
    }
    if (staff.role !== 'admin') return reply({ error:'仅管理员可执行此操作' },403);
    if(b.action==='ip-rules') return reply({rules:check(await db.from('market_ip_rules').select('*').gt('cancel_streak',0).order('updated_at',{ascending:false}))});
    if(b.action==='unblock-ip') { check(await db.from('market_ip_rules').update({blocked:false,cancel_streak:0,updated_at:new Date().toISOString()}).eq('ip_hash',text(b.ip_hash,64,64)).select().single()); return reply({ok:true}); }
    if (b.action === 'save-product') {
      const data = { name:text(b.name,1,60), unit:text(b.unit,1,20) };
      if (b.id) check(await db.from('market_products').update(data).eq('id',b.id).eq('active',true).select().single());
      else check(await db.from('market_products').insert(data));
      return reply({ok:true});
    }
    if (b.action === 'delete-product') { check(await db.from('market_products').update({active:false}).eq('id',b.id).select().single()); return reply({ok:true}); }
    if (b.action === 'supplier') {
      const supplier=check(await db.from('market_staff').select('username').eq('role','supplier').maybeSingle()); return reply({supplier});
    }
    if (b.action === 'save-supplier') {
      const name=username(b.username), pass=password(b.password);
      if(name==='admin') fail('供应商账号不能为 admin');
      const old=check(await db.from('market_staff').select('*').eq('role','supplier').maybeSingle());
      if(old) {
        check(await db.auth.admin.updateUserById(old.user_id,{email:email(name),password:pass,email_confirm:true}));
        check(await db.from('market_staff').update({username:name,must_change:true,token_valid_after:Math.floor(Date.now()/1000)}).eq('role','supplier'));
      } else {
        const created=check(await db.auth.admin.createUser({email:email(name),password:pass,email_confirm:true}));
        const inserted=await db.from('market_staff').insert({role:'supplier',username:name,user_id:created.user.id});
        if(inserted.error) { await db.auth.admin.deleteUser(created.user.id); check(inserted); }
      }
      return reply({ok:true});
    }
    return reply({error:'未知操作'},400);
  } catch (e) { return reply({error:e instanceof Error?e.message:'请求失败'},400); }
});
