// server.js — เซิร์ฟเวอร์เดียว: เสิร์ฟหน้าเว็บ + ฐานข้อมูล (สมาชิก ยอดเงิน สต็อก คำสั่งซื้อ ตั้งค่าร้าน) + รับซองทรูมันนี่
// Node.js 18+  ไม่ต้องติดตั้งแพ็กเกจเพิ่ม     รัน:  ADMIN_PASSWORD=รหัสแอดมิน node server/server.js
// ตัวแปร: PORT(3000) | ADMIN_PASSWORD (รหัสแอดมินตอนสร้างฐานข้อมูลครั้งแรก ไม่ตั้ง=admin1234) | DATA_DIR (โฟลเดอร์เก็บข้อมูล ค่าเริ่มต้น ./data)
//         ALLOW_ORIGIN (ใช้เมื่อหน้าเว็บอยู่คนละโดเมนกับเซิร์ฟเวอร์) | TZ_OFFSET (เขตเวลา ชั่วโมง ค่าเริ่มต้น 7) | ADMIN_TOKEN (รหัสซิงค์แบบเก่า ไม่จำเป็น)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000, ORIGIN = process.env.ALLOW_ORIGIN || '', TZ = +(process.env.TZ_OFFSET ?? 7);
const ROOT = path.join(__dirname, '..'), DDIR = process.env.DATA_DIR || path.join(ROOT, 'data'), DBF = path.join(DDIR, 'db.json');
fs.mkdirSync(DDIR, { recursive: true });
let _u = 0; const uid = () => Date.now() * 100 + (_u++ % 100), rb = x => Math.round(x * 100) / 100;
const now = () => { const d = new Date(Date.now() + TZ * 36e5), p = n => String(n).padStart(2, '0'); return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()); };
const hashPw = pw => { const s = crypto.randomBytes(16); return s.toString('hex') + ':' + crypto.scryptSync(pw, s, 32).toString('hex'); };
const checkPw = (pw, h) => { try { const [s, k] = h.split(':'); return crypto.timingSafeEqual(crypto.scryptSync(pw, Buffer.from(s, 'hex'), 32), Buffer.from(k, 'hex')); } catch (e) { return false; } };
// ---------- ฐานข้อมูล (ไฟล์ JSON เขียนแบบ atomic) ----------
const seed = () => ({ rev: 1, music: '', musicRev: 0, adminHash: hashPw(process.env.ADMIN_PASSWORD || 'admin1234'),
  cfg: { name: 'DEXTER STORE', slogan: 'ศูนย์รวมไอดีเกมและโค้ดดิจิทัล ส่งอัตโนมัติ 24 ชม.', logo: '', banners: [], c1: '#06b6d4', c2: '#6366f1', bg: '#0b0f17', tx: '', topup: 1, prof: 1, hTop: 1, hBuy: 1, pay: 'PromptPay: 000-000-0000 (ชื่อบัญชี...)', twPhone: '', qrimg: '', pqOn: 1, ptOn: 1, pcOn: 1, min: 10, auto: 0, musicUrl: '', musicName: '', musicAuto: 0 },
  cats: [{ id: 1, name: 'ไอดีเกม', img: '' }, { id: 2, name: 'เงินในเกม', img: '' }, { id: 3, name: 'บัตรเติมเงิน', img: '' }], ranks: [{ id: 1, name: 'สมาชิก', disc: 0 }, { id: 2, name: 'VIP', disc: 0 }],
  prods: [], coupons: [], codes: [], stock: {}, users: [{ id: 1, name: 'admin', email: '', pw: '', rank: 0, bal: 0, admin: 1 }], tx: [], sessions: {}, vouchers: [] });
let DB; try { DB = JSON.parse(fs.readFileSync(DBF, 'utf8')); } catch (e) { DB = seed(); }
let wt = null, lastBak = 0;
function flush() { clearTimeout(wt); wt = null; const t = Date.now(); for (const k in DB.sessions) if (DB.sessions[k].exp < t) delete DB.sessions[k];
  if (fs.existsSync(DBF) && t - lastBak > 6e5) { fs.copyFileSync(DBF, DBF + '.bak'); lastBak = t; }
  fs.writeFileSync(DBF + '.tmp', JSON.stringify(DB)); fs.renameSync(DBF + '.tmp', DBF); }
const dirty = () => { if (!wt) wt = setTimeout(flush, 250); };
['SIGINT', 'SIGTERM'].forEach(s => process.on(s, () => { flush(); process.exit(0); }));
if (!fs.existsSync(DBF)) flush();
// ---------- ตัวช่วย ----------
const H = { 'Content-Type': 'application/json; charset=utf-8' };
const send = (res, c, o) => { const h = { ...H }; if (ORIGIN) { h['Access-Control-Allow-Origin'] = ORIGIN; h['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'; h['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'; } res.writeHead(c, h); res.end(JSON.stringify(o)); };
const err = (res, c, m) => send(res, c, { error: m });
const body = (req, lim) => new Promise((ok, no) => { let b = '', n = 0; req.on('data', d => { n += d.length; if (n > lim) { req.destroy(); no(new Error('big')); } else b += d; }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { no(e); } }); req.on('error', no); });
const tokH = t => crypto.createHash('sha256').update(t).digest('hex');
const newSess = (u, admin) => { const t = crypto.randomBytes(32).toString('hex'); DB.sessions[tokH(t)] = { uid: u.id, admin: !!admin, exp: Date.now() + (admin ? 12 * 36e5 : 30 * 864e5) }; dirty(); return t; };
function who(req) { const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); if (!t) return null; const s = DB.sessions[tokH(t)]; if (!s || s.exp < Date.now()) return null; const u = DB.users.find(x => x.id == s.uid); return u ? { u, admin: s.admin, h: tokH(t) } : null; }
const fails = new Map();
function limited(req, res) { const ip = req.socket.remoteAddress, f = fails.get(ip); if (f && f.n >= 10 && Date.now() - f.t < 6e4) { err(res, 429, 'ลองผิดหลายครั้ง กรุณารอ 1 นาที'); return true; } return false; }
const failed = req => { const ip = req.socket.remoteAddress, f = fails.get(ip), fresh = f && Date.now() - f.t < 6e4; fails.set(ip, { n: (fresh ? f.n : 0) + 1, t: fresh ? f.t : Date.now() }); };
const U = u => ({ id: u.id, name: u.name, email: u.email || '', rank: u.rank, bal: u.bal });
const pubTx = t => { const { slip, ...r } = t; return r; };
const musicUrl = () => DB.music ? '/api/music?v=' + DB.musicRev : '';
function catalog(admin) {
  const cfg = { ...DB.cfg, music: musicUrl() }; delete cfg.adminHash;
  return { rev: DB.rev, cfg, cats: DB.cats, ranks: DB.ranks, coupons: admin ? DB.coupons : undefined,
    prods: DB.prods.map(p => ({ ...p, variants: p.variants.map(v => admin ? { ...v, items: DB.stock[v.id] || [] } : { id: v.id, name: v.name, price: v.price, n: (DB.stock[v.id] || []).length }) })) };
}
const ALLOWED_CFG = Object.keys(seed().cfg).filter(k => !['musicName'].includes(k));
// ---------- ซองทรูมันนี่ ----------
const MSG = { VOUCHER_NOT_FOUND: 'ไม่พบซองนี้', VOUCHER_EXPIRED: 'ซองหมดอายุแล้ว', VOUCHER_OUT_OF_STOCK: 'ซองนี้ถูกรับไปแล้ว', TARGET_USER_REDEEMED: 'ซองนี้ถูกรับไปแล้ว', CANNOT_GET_OWN_VOUCHER: 'ไม่สามารถรับซองของตัวเองได้' };
async function redeem(hash, phone) {
  const r = await fetch(`https://gift.truemoney.com/campaign/vouchers/${hash}/redeem`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, body: JSON.stringify({ mobile: phone, voucher_hash: hash }) });
  const j = await r.json().catch(() => ({})), code = j.status && j.status.code;
  if (code === 'SUCCESS') { const a = parseFloat(j.data && j.data.my_ticket && j.data.my_ticket.amount_baht); return a > 0 ? { ok: true, amount: a } : { unknown: true }; }
  return code ? { reject: MSG[code] || 'ไม่สามารถรับซองนี้ได้' } : { unknown: true };
}
const inflight = new Set();
// ---------- เส้นทางสำหรับลูกค้า ----------
const R = {};
R['POST /api/register'] = async (req, res, b) => {
  if (limited(req, res)) return; const e = String(b.email || '').trim(), n = String(b.name || '').trim(), p = String(b.pw || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return err(res, 400, 'รูปแบบอีเมลไม่ถูกต้อง');
  if (n.length < 3 || n.length > 20 || n.includes('@') || p.length < 6) return err(res, 400, 'ชื่อ 3-20 ตัวอักษร (ห้ามมี @) รหัสอย่างน้อย 6 ตัว');
  const k = n.toLowerCase(); if (k === 'admin' || DB.users.some(x => x.name.toLowerCase() === k)) return err(res, 409, 'ชื่อนี้ถูกใช้แล้ว');
  if (DB.users.some(x => (x.email || '').toLowerCase() === e.toLowerCase())) return err(res, 409, 'อีเมลนี้ถูกใช้สมัครแล้ว');
  failed(req); const u = { id: uid(), name: n, email: e, pw: hashPw(p), rank: DB.ranks[0].id, bal: 0 }; DB.users.push(u); dirty(); send(res, 200, { token: newSess(u), user: U(u) });
};
R['POST /api/login'] = async (req, res, b) => {
  if (limited(req, res)) return; const k = String(b.id || '').trim().toLowerCase(), u = DB.users.find(x => !x.admin && (x.name.toLowerCase() === k || (x.email || '').toLowerCase() === k));
  if (!u || !checkPw(String(b.pw || ''), u.pw)) { failed(req); return err(res, 401, 'ชื่อผู้ใช้/อีเมล หรือรหัสผ่านไม่ถูกต้อง'); }
  fails.delete(req.socket.remoteAddress); send(res, 200, { token: newSess(u), user: U(u) });
};
R['POST /api/admin/login'] = async (req, res, b) => {
  if (limited(req, res)) return; if (!checkPw(String(b.pw || '').trim(), DB.adminHash)) { failed(req); return err(res, 401, 'รหัสแอดมินไม่ถูกต้อง'); }
  fails.delete(req.socket.remoteAddress); send(res, 200, { token: newSess(DB.users.find(x => x.admin), true) });
};
R['POST /api/logout'] = async (req, res, b, a) => { if (a) { delete DB.sessions[a.h]; dirty(); } send(res, 200, {}); };
R['GET /api/public'] = async (req, res) => send(res, 200, catalog(false));
R['GET /api/me'] = async (req, res, b, a) => { if (!a) return err(res, 401, 'กรุณาเข้าสู่ระบบ'); send(res, 200, { user: U(a.u), tx: DB.tx.filter(t => t.user === a.u.name).slice(0, 500).map(pubTx) }); };
R['POST /api/view'] = async (req, res, b) => { const p = DB.prods.find(x => x.id == b.pid); if (p) { p.views = (p.views || 0) + 1; dirty(); } send(res, 200, {}); };
R['POST /api/coupon'] = async (req, res, b) => { const c = DB.coupons.find(x => x.code === String(b.code || '').toUpperCase()); if (!c || (c.max && (c.used || 0) >= c.max)) return err(res, 400, 'โค้ดไม่ถูกต้องหรือถูกใช้ครบแล้ว'); send(res, 200, { code: c.code, type: c.type, val: c.val }); };
R['POST /api/order'] = async (req, res, b, a) => {
  if (!a) return err(res, 401, 'กรุณาเข้าสู่ระบบ'); const u = a.u, p = DB.prods.find(x => x.id == b.pid), v = p && p.variants.find(x => x.id == b.vid); if (!v) return err(res, 404, 'ไม่พบสินค้า');
  const st = DB.stock[v.id] || (DB.stock[v.id] = []); if (!st.length) return err(res, 409, 'ตัวเลือกนี้หมด');
  const r = DB.ranks.find(x => x.id == u.rank), disc = u.admin ? 0 : (r && r.disc) || 0, a1 = rb(v.price - rb(v.price * disc / 100));
  let cp = null; if (b.code) { cp = DB.coupons.find(c => c.code === String(b.code).toUpperCase()); if (!cp || (cp.max && (cp.used || 0) >= cp.max)) return err(res, 400, 'โค้ดไม่ถูกต้องหรือถูกใช้ครบแล้ว'); }
  const cd = cp ? rb(cp.type === 'pct' ? a1 * cp.val / 100 : Math.min(cp.val, a1)) : 0, total = Math.max(0, rb(a1 - cd)); if (u.bal < total) return err(res, 402, 'ยอดเงินไม่พอ');
  u.bal = rb(u.bal - total); const key = st.shift(); if (cp) cp.used = (cp.used || 0) + 1; const title = p.name + (v.name ? ' · ' + v.name : '');
  DB.tx.unshift({ id: uid(), date: now(), user: u.name, type: 'buy', title, amt: -total, key, st: 'ok' }); dirty(); send(res, 200, { key, bal: u.bal, title, total });
};
R['POST /api/redeem'] = async (req, res, b, a) => {
  if (!a) return err(res, 401, 'กรุณาเข้าสู่ระบบ'); const v = String(b.code || '').trim().toUpperCase(), k = DB.codes.find(x => x.code === v && !x.used); if (!k) return err(res, 400, 'โค้ดไม่ถูกต้องหรือถูกใช้แล้ว');
  k.used = a.u.name; a.u.bal = rb(a.u.bal + k.amt); DB.tx.unshift({ id: uid(), date: now(), user: a.u.name, type: 'top', title: 'โค้ดเติมเงิน ' + v, amt: k.amt, st: 'ok' }); dirty(); send(res, 200, { st: 'ok', amt: k.amt, bal: a.u.bal });
};
R['POST /api/topup'] = async (req, res, b, a) => {
  if (!a) return err(res, 401, 'กรุณาเข้าสู่ระบบ'); const u = a.u, c = DB.cfg, m = b.method, amt = rb(parseFloat(b.amount));
  if (!c.topup) return err(res, 403, 'ปิดระบบเติมเงิน'); if (m !== 'qr' && m !== 'tw') return err(res, 400, 'ช่องทางไม่ถูกต้อง');
  if (!(amt >= c.min) || amt > 1e6) return err(res, 400, 'ขั้นต่ำ ' + c.min + ' บาท'); if (DB.tx.filter(t => t.user === u.name && t.st === 'wait').length >= 5) return err(res, 429, 'มีคำขอรออนุมัติครบ 5 รายการแล้ว');
  const t = { id: uid(), date: now(), user: u.name, type: 'top', amt, st: 'wait' };
  if (m === 'qr') { if (!c.pqOn) return err(res, 403, 'ปิดช่องทางนี้'); const s = String(b.slip || ''); if (!/^data:image\//.test(s) || s.length > 1.6e6) return err(res, 400, 'กรุณาแนบสลิป (รูปภาพ)'); t.title = 'PromptPay'; t.slip = s; DB.tx.unshift(t); dirty(); return send(res, 200, { st: 'wait', message: 'ส่งคำขอแล้ว รอแอดมินอนุมัติ' }); }
  if (!c.ptOn) return err(res, 403, 'ปิดช่องทางนี้'); const mm = String(b.voucher || '').match(/gift\.truemoney\.com\/campaign\/\?v=([0-9A-Za-z]{10,64})/); if (!mm) return err(res, 400, 'ลิงก์ซองไม่ถูกต้อง ต้องเป็นลิงก์ gift.truemoney.com');
  const h = mm[1]; if (inflight.has(h) || DB.vouchers.includes(h) || DB.tx.some(x => x.vc === h)) return err(res, 409, 'ซองนี้ถูกส่งเข้ามาแล้ว'); t.title = 'TrueMoney ซอง'; t.vc = h;
  if (c.auto && /^0\d{9}$/.test(c.twPhone || '')) {
    inflight.add(h); let r; try { r = await redeem(h, c.twPhone); } catch (e) { r = { unknown: true }; } inflight.delete(h);
    if (r.ok) { DB.vouchers.push(h); t.amt = r.amount; t.st = 'ok'; u.bal = rb(u.bal + r.amount); DB.tx.unshift(t); dirty(); return send(res, 200, { st: 'ok', amt: r.amount, bal: u.bal }); }
    if (r.reject) return err(res, 400, r.reject);
  }
  DB.tx.unshift(t); dirty(); send(res, 200, { st: 'wait', message: 'ส่งคำขอแล้ว รอแอดมินอนุมัติ' });
};
// ---------- เส้นทางแอดมิน ----------
const A = {};
A['GET /api/admin/all'] = async (req, res) => send(res, 200, { ...catalog(true), users: DB.users.filter(u => !u.admin).map(U), adm: U(DB.users.find(u => u.admin)), tx: DB.tx.slice(0, 2000), codes: DB.codes });
A['POST /api/admin/catalog'] = async (req, res, b) => {
  if (!b.cfg || !Array.isArray(b.cats) || !Array.isArray(b.ranks) || !Array.isArray(b.prods)) return err(res, 400, 'ข้อมูลไม่ถูกต้อง');
  for (const k of ALLOWED_CFG) if (k in b.cfg) DB.cfg[k] = b.cfg[k];
  DB.cats = b.cats.map(c => ({ id: +c.id, name: String(c.name || '').slice(0, 40), img: c.img || '' }));
  DB.ranks = b.ranks.map(r => ({ id: +r.id, name: String(r.name || '').slice(0, 30), disc: Math.max(0, Math.min(90, +r.disc || 0)) })); if (!DB.ranks.length) DB.ranks = seed().ranks;
  for (const u of DB.users) if (!u.admin && !DB.ranks.some(r => r.id == u.rank)) u.rank = DB.ranks[0].id;
  const old = Object.fromEntries(DB.prods.map(p => [p.id, p])), ids = new Set();
  DB.prods = b.prods.map(p => { const vs = (p.variants || []).map(v => { ids.add(+v.id); return { id: +v.id, name: String(v.name || '').slice(0, 40), price: Math.max(0, Math.min(1e6, +v.price || 0)) }; });
    return { id: +p.id, name: String(p.name || '').slice(0, 120), cat: +p.cat, tag: String(p.tag || '').slice(0, 12), badges: String(p.badges || '').slice(0, 200), desc: String(p.desc || '').slice(0, 3000), img: p.img || '', views: (old[p.id] && old[p.id].views) || 0, variants: vs }; }).filter(p => p.variants.length);
  for (const k of Object.keys(DB.stock)) if (!ids.has(+k)) delete DB.stock[k]; for (const i of ids) if (!DB.stock[i]) DB.stock[i] = [];
  const used = Object.fromEntries(DB.coupons.map(c => [c.code, c.used || 0]));
  DB.coupons = (b.coupons || []).map(c => ({ code: String(c.code).toUpperCase(), type: c.type === 'amt' ? 'amt' : 'pct', val: +c.val || 0, max: Math.max(0, +c.max || 0), used: used[String(c.code).toUpperCase()] || 0 }));
  DB.rev++; dirty(); send(res, 200, { rev: DB.rev });
};
A['POST /api/admin/stock'] = async (req, res, b) => {
  if (!DB.prods.some(p => p.variants.some(v => v.id == b.vid))) return err(res, 404, 'ไม่พบตัวเลือกสินค้า'); const s = DB.stock[b.vid] || (DB.stock[b.vid] = []);
  if (b.action === 'add') { const have = new Set(s), add = [...new Set((b.items || []).map(x => String(x).trim()).filter(Boolean))].filter(x => !have.has(x)); s.push(...add); b.added = add.length; }
  else if (b.action === 'del') s.splice(+b.index, 1); else if (b.action === 'clear') s.splice(0);
  dirty(); send(res, 200, { items: s, added: b.added });
};
A['POST /api/admin/user'] = async (req, res, b) => {
  const u = DB.users.find(x => x.id == b.id); if (!u) return err(res, 404, 'ไม่พบสมาชิก');
  if ('rank' in b && !u.admin && DB.ranks.some(r => r.id == b.rank)) u.rank = +b.rank;
  if ('adj' in b) { const n = parseFloat(b.adj); if (!n || Math.abs(n) > 1e7) return err(res, 400, 'จำนวนเงินไม่ถูกต้อง'); u.bal = Math.max(0, rb(u.bal + n)); DB.tx.unshift({ id: uid(), date: now(), user: u.name, type: 'top', title: n > 0 ? 'แอดมินเพิ่มเงิน' : 'แอดมินหักเงิน', amt: n, st: 'ok' }); }
  if ('pw' in b) { if (u.admin || String(b.pw).length < 6) return err(res, 400, 'รหัสต้องมีอย่างน้อย 6 ตัว'); u.pw = hashPw(String(b.pw)); for (const k in DB.sessions) if (DB.sessions[k].uid === u.id) delete DB.sessions[k]; }
  dirty(); send(res, 200, { user: U(u) });
};
A['POST /api/admin/topup'] = async (req, res, b) => {
  const t = DB.tx.find(x => x.id == b.id); if (!t || t.st !== 'wait') return err(res, 409, 'รายการนี้ถูกจัดการแล้ว');
  if (b.ok) { const u = DB.users.find(x => x.name === t.user); if (u) u.bal = rb(u.bal + t.amt); t.st = 'ok'; t.slip = ''; if (t.vc) DB.vouchers.push(t.vc); } else t.st = 'no'; dirty(); send(res, 200, {});
};
A['POST /api/admin/code'] = async (req, res, b) => {
  const amt = parseFloat(b.amt), code = (String(b.code || '').trim() || crypto.randomBytes(4).toString('hex')).toUpperCase(); if (!(amt > 0)) return err(res, 400, 'ใส่จำนวนเงิน'); if (DB.codes.some(c => c.code === code)) return err(res, 409, 'มีโค้ดนี้แล้ว');
  DB.codes.unshift({ code, amt, used: '' }); dirty(); send(res, 200, {});
};
A['POST /api/admin/password'] = async (req, res, b) => { if (String(b.pw || '').length < 6) return err(res, 400, 'อย่างน้อย 6 ตัว'); DB.adminHash = hashPw(String(b.pw)); dirty(); send(res, 200, {}); };
A['POST /api/admin/music'] = async (req, res, b) => {
  if (b.clear) { DB.music = ''; DB.cfg.musicName = ''; } else { if (!/^data:audio\/[\w.+-]+;base64,/.test(b.data || '') || b.data.length > 6e6) return err(res, 400, 'ไฟล์เสียงไม่ถูกต้องหรือใหญ่เกินไป'); DB.music = b.data; DB.cfg.musicName = String(b.name || 'เพลง').slice(0, 80); }
  DB.musicRev++; dirty(); send(res, 200, { music: musicUrl(), name: DB.cfg.musicName });
};
// ---------- เสิร์ฟหน้าเว็บ/เพลง ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
function staticFile(req, res) {
  let p; try { p = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); } if (p === '/') p = '/index.html';
  const f = path.normalize(path.join(ROOT, p)), rel = f.slice(ROOT.length);
  if (!f.startsWith(ROOT + path.sep) || /^[\\/](server|data)[\\/]/.test(rel) || !MIME[path.extname(f)] || !fs.existsSync(f)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)], 'Cache-Control': 'no-cache' }); fs.createReadStream(f).pipe(res);
}
http.createServer(async (req, res) => {
  const url = req.url.split('?')[0], key = req.method + ' ' + url;
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (url === '/api/music' && req.method === 'GET') { const m = DB.music.match(/^data:([^;]+);base64,(.*)$/s); if (!m) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=31536000' }); return res.end(Buffer.from(m[2], 'base64')); }
    if (url.startsWith('/api/')) {
      const a = who(req), h = R[key] || (A[key] && (a && a.admin ? A[key] : null)); if (A[key] && !(a && a.admin)) return err(res, 401, 'ต้องเข้าสู่ระบบแอดมิน'); if (!h) return err(res, 404, 'ไม่พบเส้นทาง');
      const lim = /admin\/(catalog|music)/.test(url) ? 40e6 : 3e6; return await h(req, res, req.method === 'POST' ? await body(req, lim) : {}, a);
    }
    if (req.method === 'GET') return staticFile(req, res); res.writeHead(405); res.end();
  } catch (e) { console.error(e); if (!res.headersSent) err(res, 500, 'เซิร์ฟเวอร์ผิดพลาด'); }
}).listen(PORT, () => console.log('Dexter Store server: http://localhost:' + PORT + '  (ข้อมูลที่ ' + DDIR + ')' + (process.env.ADMIN_PASSWORD ? '' : '  ⚠ ยังใช้รหัสแอดมินเริ่มต้น admin1234 ให้เปลี่ยนในหลังบ้าน')));
