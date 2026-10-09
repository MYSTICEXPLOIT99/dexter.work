// api.js — โหมดเซิร์ฟเวอร์: เมื่อเปิดผ่านเซิร์ฟเวอร์ (server/server.js) ข้อมูลทั้งหมดอยู่บนฐานข้อมูลกลาง
// สมาชิก/ยอดเงิน/สต็อก/คำสั่งซื้อ/ตั้งค่าร้าน ใช้ร่วมกันทุกเครื่อง และเซิร์ฟเวอร์เป็นผู้คิดเงิน ตัดสต็อก ตรวจโค้ด (หน้าเว็บแก้ตัวเลขเองไม่ได้)
// ถ้าเปิดเป็นไฟล์เดี่ยว (file://) จะใช้โหมดเก็บในเบราว์เซอร์แบบเดิม  หน้าเว็บอยู่คนละโดเมนกับเซิร์ฟเวอร์: localStorage.setItem('dx_api','https://เซิร์ฟเวอร์')
const API_BASE=()=>{try{return(localStorage.getItem('dx_api')||'').replace(/\/+$/,'')}catch(e){return''}};
const ss=(k,v)=>{try{v===null?sessionStorage.removeItem(k):sessionStorage.setItem(k,v)}catch(e){}},ls=(k,v)=>{try{v===null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}},gs=k=>{try{return sessionStorage.getItem(k)||''}catch(e){return''}},gl=k=>{try{return localStorage.getItem(k)||''}catch(e){return''}};
async function api(path,body,asAdmin){const t=(asAdmin||isAdmin)?gs('dx_ta'):(gl('dx_tk')||gs('dx_tk')),ac=new AbortController(),tm=setTimeout(()=>ac.abort(),20000);
try{const r=await fetch(API_BASE()+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:ac.signal});const j=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(j.error||'เซิร์ฟเวอร์ตอบ '+r.status);e.status=r.status;throw e}return j}
catch(e){throw e.name=='AbortError'?new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ทัน'):e}finally{clearTimeout(tm)}}
function applyCat(p,admin){S.cfg={...D.cfg,...p.cfg};delete S.cfg.pw;S.cats=p.cats;S.ranks=p.ranks;S.prods=p.prods.map(x=>({...x,variants:x.variants.map(v=>({id:v.id,name:v.name,price:v.price,items:admin?v.items:Array(v.n||0).fill('')}))}));if(admin)S.coupons=p.coupons||[]}
const srvPub=async()=>applyCat(await api('/api/public',undefined,false));
async function srvMe(){const r=await api('/api/me');me=r.user;S.tx=r.tx}
async function srvAdminLoad(){const r=await api('/api/admin/all',undefined,true);applyCat(r,true);S.users=r.users;S.adm=r.adm;S.tx=r.tx;S.codes=r.codes;if(isAdmin)me=S.adm}
const srvRefresh=async()=>{if(isAdmin)await srvAdminLoad();else{await srvPub();if(me)await srvMe()}};
function srvClear(){S.users=[];S.tx=[];S.codes=[];S.coupons=[]}
function srvExpired(){ls('dx_tk',null);ss('dx_tk',null);ss('dx_ta',null);ss('dx_a',null);me=null;isAdmin=false;srvClear();srvPub().catch(()=>{}).finally(()=>{toast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');go('home')})}
async function srvBoot(){if(!/^https?:$/.test(location.protocol)&&!API_BASE())return;try{await srvPub()}catch(e){return}
SRV=true;srvClear();me=null;isAdmin=false;
if(gs('dx_ta')){try{isAdmin=true;await srvAdminLoad()}catch(e){isAdmin=false;me=null;ss('dx_ta',null);ss('dx_a',null)}}
if(!isAdmin&&(gl('dx_tk')||gs('dx_tk'))){try{await srvMe()}catch(e){ls('dx_tk',null);ss('dx_tk',null);me=null}}
if(page=='admin'&&!isAdmin)page='home';if(page=='profile'&&!me)page='home';setInterval(srvPoll,20000)}
function srvPoll(){if(!isAdmin||page!='admin'||srvT||!$('mo').classList.contains('hid')||/INPUT|TEXTAREA|SELECT/.test((document.activeElement||{}).tagName||''))return;srvAdminLoad().then(()=>{if(page=='admin')render()}).catch(()=>{})}
// ---------- คิวส่งข้อมูลหลังบ้าน ----------
let srvQ=Promise.resolve(),srvT=null;
const srvEnq=fn=>{srvQ=srvQ.then(fn).catch(e=>{toast('บันทึกไม่สำเร็จ: '+e.message);if(e.status==401)srvExpired()});return srvQ};
async function srvCatalog(){await api('/api/admin/catalog',{cfg:S.cfg,cats:S.cats,ranks:S.ranks,coupons:S.coupons,prods:S.prods.map(p=>({...p,variants:p.variants.map(v=>({id:v.id,name:v.name,price:v.price}))}))})}
function srvSave(){if(!isAdmin)return;clearTimeout(srvT);srvT=setTimeout(()=>{srvT=null;srvEnq(srvCatalog)},600)}
const srvFlush=()=>{if(srvT){clearTimeout(srvT);srvT=null;srvEnq(srvCatalog)}return srvQ};
const srvAct=fn=>srvFlush().then(()=>srvEnq(async()=>{await fn();await srvAdminLoad();render()}));
// ---------- ครอบฟังก์ชันเดิม: โหมดเซิร์ฟเวอร์ทำงานต่างออกไป ----------
function hook(n,f){const o=window[n];window[n]=function(...a){return SRV?f(o,...a):o.apply(this,a)}}
const need=fn=>async(...a)=>{try{return await fn(...a)}catch(e){if(e.status==401&&!/(login|register)/.test(e.message))return srvExpired();toast(e.message)}};
hook('login',need(async()=>{if(locked())return;const n=$('au').value.trim(),p=$('ap').value;rem=$('rm')?$('rm').checked:true;
 if(n==''||n.toLowerCase()=='admin'){try{const r=await api('/api/admin/login',{pw:p},false);ss('dx_ta',r.token);ss('dx_a','1');isAdmin=true;await srvAdminLoad();CM();toast('เข้าสู่หลังบ้านแล้ว');return go('admin')}catch(e){isAdmin=false;ss('dx_ta',null);ss('dx_a',null);if(e.status==401)return bad('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');throw e}}
 let r;try{r=await api('/api/login',{id:n,pw:p},false)}catch(e){if(e.status==401)return bad('ชื่อผู้ใช้/อีเมล หรือรหัสผ่านไม่ถูกต้อง');throw e}
 fails=0;ls('dx_tk',null);ss('dx_tk',null);(rem?ls:ss)('dx_tk',r.token);me=r.user;await srvRefresh();CM();toast('ยินดีต้อนรับ '+me.name);render()}));
hook('reg',need(async()=>{const e=$('ae').value.trim(),n=$('au').value.trim(),p=$('ap').value;if(!BOT.ok)return toast('กรุณายืนยันว่าไม่ใช่บอทก่อน');if(p!==$('ap2').value)return toast('รหัสผ่านสองช่องไม่ตรงกัน');
 const r=await api('/api/register',{email:e,name:n,pw:p},false);rem=true;ls('dx_tk',r.token);me=r.user;await srvRefresh();CM();toast('สมัครสำเร็จ ได้ยศ '+rank(me.rank));render()}));
function srvLogout(){api('/api/logout',{}).catch(()=>{});ls('dx_tk',null);ss('dx_tk',null);ss('dx_ta',null);ss('dx_a',null);me=null;isAdmin=false;srvClear();clearTimeout(srvT);srvT=null;go('home');srvPub().then(()=>{if(!isAdmin)render()}).catch(()=>{})}
hook('go',(o,p)=>{o(p);if((p=='home'||p=='products')&&!isAdmin)srvPub().then(()=>{if(page==p)render()}).catch(()=>{})});
hook('openP',(o,id)=>{o(id);api('/api/view',{pid:id}).catch(()=>{})});
hook('useCp',need(async()=>{const v=$('cpi').value.trim().toUpperCase();if(!v){DT.code='';DT.cp=null;return render()}const c=await api('/api/coupon',{code:v});DT.code=c.code;DT.cp={code:c.code,type:c.type,val:c.val,max:0,used:0};toast('ใช้โค้ดส่วนลดแล้ว');render()}));
hook('order',need(async()=>{const p=S.prods.find(x=>x.id==DT.pid);if(!p||T.ord)return;if(!me){toast('กรุณาเข้าสู่ระบบก่อน');return auth('l')}const o=vars(p)[DT.vi];if(!o||!o.items.length)return toast('ตัวเลือกนี้หมด');const k=calc(o);if(me.bal<k.total){toast('ยอดเงินไม่พอ');return S.cfg.topup?go('refill'):0}
 T.ord=1;try{const r=await api('/api/order',{pid:p.id,vid:o.id,code:DT.cp?DT.cp.code:''});DT.cp=null;DT.code='';M(`<b>สั่งซื้อสำเร็จ</b><span>${E(r.title)}</span><div class="st a" style="word-break:break-all;font-family:monospace">${E(r.key)}</div><div class="m" style="font-size:12px">เก็บรหัสนี้ไว้ ดูย้อนหลังได้ที่โปรไฟล์/ประวัติ</div><button class="btn" onclick="CM()">ตกลง</button>`);await srvRefresh();render()}catch(e){await srvRefresh().catch(()=>{});render();throw e}finally{T.ord=0}}));
hook('topup',need(async()=>{if(!me){toast('กรุณาเข้าสู่ระบบ');return auth('l')}if(T.api)return toast('กำลังทำรายการ กรุณารอสักครู่');
 if(pm=='code'){T.api=1;try{const r=await api('/api/redeem',{code:$('rc').value});toast('เติมเงินสำเร็จ +'+r.amt);await srvRefresh();render()}finally{T.api=0}return}
 const a=rb(parseFloat($('ra').value));if(!(a>=S.cfg.min))return toast('ขั้นต่ำ '+S.cfg.min+' บาท');if(pm=='qr'&&!T.slip)return toast('กรุณาแนบสลิป');const v=pm=='tw'?$('rl').value.trim():'';if(pm=='tw'&&!/gift\.truemoney\.com\/campaign\/\?v=[0-9A-Za-z]{10,64}/.test(v))return toast('ลิงก์ซองไม่ถูกต้อง ต้องเป็นลิงก์ gift.truemoney.com');
 T.api=1;toast('กำลังตรวจสอบ...');try{const r=await api('/api/topup',{method:pm,amount:a,slip:pm=='qr'?T.slip:'',voucher:v});T.slip='';toast(r.st=='ok'?'เติมเงินสำเร็จ +'+r.amt:(r.message||'ส่งคำขอแล้ว รอแอดมินอนุมัติ'));await srvRefresh();render()}finally{T.api=0}}));
// ---------- หลังบ้าน ----------
hook('adj',(o,id,s)=>{const n=parseFloat($('mb'+id).value);if(!(n>0))return toast('ใส่จำนวนเงิน');srvAct(()=>api('/api/admin/user',{id,adj:s*n}))});
hook('setRank',(o,id,r)=>{srvAct(()=>api('/api/admin/user',{id,rank:r}))});
hook('rstPw',(o,id)=>{const u=user(id),v=prompt('ตั้งรหัสผ่านใหม่ให้ '+u.name+' (อย่างน้อย 6 ตัว)');if(v===null)return;if(v.length<6)return toast('รหัสต้องมีอย่างน้อย 6 ตัว');srvAct(()=>api('/api/admin/user',{id,pw:v})).then(()=>toast('ตั้งรหัสใหม่ให้ '+u.name+' แล้ว'))});
hook('appr',(o,id,ok)=>{srvAct(()=>api('/api/admin/topup',{id,ok:ok?1:0}))});
hook('mkCode',()=>{const a=parseFloat($('ca').value);if(!(a>0))return toast('ใส่จำนวนเงิน');srvAct(()=>api('/api/admin/code',{code:$('cc').value.trim(),amt:a}))});
hook('setAdminPw',()=>{const v=$('np').value;if(v.length<6)return toast('อย่างน้อย 6 ตัว');srvAct(()=>api('/api/admin/password',{pw:v})).then(()=>toast('เปลี่ยนรหัสแอดมินแล้ว'))});
hook('saveProd',(o)=>{const n0=S.prods.length;o();if(S.prods.length==n0)return;const p=S.prods[n0],init=p.variants.map(v=>({id:v.id,items:[...v.items]})).filter(x=>x.items.length);srvFlush();init.forEach(x=>srvEnq(()=>api('/api/admin/stock',{vid:x.id,action:'add',items:x.items})));srvEnq(async()=>{await srvAdminLoad();render()})});
const stk2=(id,vi,body)=>{const p=S.prods.find(x=>x.id==id),o=vars(p)[vi];return srvFlush().then(()=>srvEnq(async()=>{const r=await api('/api/admin/stock',{vid:o.id,...body});o.items=r.items;return r}))};
hook('addItems',(oo,id,vi)=>{const l=parseItems($('sti').value);if(!l.length)return toast('วางรายการสต็อกก่อน (1 บรรทัด = 1 ชิ้น)');stk2(id,vi,{action:'add',items:l}).then(r=>{if(!r)return;toast('เพิ่มสต็อก '+r.added+' ชิ้น'+(l.length>r.added?' (ข้ามที่ซ้ำ '+(l.length-r.added)+')':''));stockM(id,vi);render()})});
hook('delItem',(oo,id,vi,i)=>{stk2(id,vi,{action:'del',index:i}).then(()=>{stockM(id,vi);render()})});
hook('clearStock',(oo,id,vi)=>{const p=S.prods.find(x=>x.id==id),o=vars(p)[vi];ask('สต็อกทั้งหมดของ "'+p.name+(o.name?' · '+o.name:'')+'" ('+o.items.length+' ชิ้น) จะถูกลบ',()=>stk2(id,vi,{action:'clear'}).then(()=>{render();toast('ล้างสต็อกแล้ว')}))});
function srvMusicUp(f){if(!f)return;if(!/^audio\//.test(f.type)&&!/\.(mp3|wav|ogg|m4a|aac)$/i.test(f.name))return toast('กรุณาเลือกไฟล์เสียง (mp3, wav, ogg, m4a)');if(f.size>3.5*1048576)return toast('ไฟล์ใหญ่เกิน 3.5 MB');const r=new FileReader();r.onload=()=>srvAct(()=>api('/api/admin/music',{data:r.result,name:f.name})).then(()=>toast('อัปโหลดเพลงแล้ว'));r.readAsDataURL(f)}
const srvMusicDel=()=>srvAct(()=>api('/api/admin/music',{clear:1}));
function srvUI(){return `<b>ฐานข้อมูลบนเซิร์ฟเวอร์</b><div class="m" style="font-size:12px">ข้อมูลทั้งหมด (สมาชิก ยอดเงิน สต็อก คำสั่งซื้อ ตั้งค่าร้าน) เก็บที่เซิร์ฟเวอร์ ทุกเครื่องเห็นข้อมูลชุดเดียวกัน บันทึกอัตโนมัติทุกครั้งที่แก้ไข หน้านี้รีเฟรชข้อมูลเองทุก 20 วินาที</div><div class="g2"><div class="st"><span class="m">สมาชิก</span><b>${S.users.length}</b></div><div class="st"><span class="m">รายการทั้งหมด</span><b>${S.tx.length}</b></div></div><div class="r"><button class="btn g" onclick="srvAct(()=>0).then(()=>toast('รีเฟรชข้อมูลแล้ว'))"><i class="fa-solid fa-rotate"></i> รีเฟรชข้อมูลจากเซิร์ฟเวอร์</button></div>`}
