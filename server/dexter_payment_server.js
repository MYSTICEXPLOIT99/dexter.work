// dexter_payment_server.js — เซิร์ฟเวอร์เดียวทำ 2 หน้าที่ (Node.js 18+ ไม่ต้องติดตั้งแพ็กเกจเพิ่ม)
//  1) POST /verify  รับซองทรูมันนี่อัตโนมัติ
//  2) GET/PUT /state ซิงค์ข้อมูลหลังบ้านไปเครื่องอื่น (ต้องมีรหัสซิงค์ ADMIN_TOKEN)
// รัน:  ADMIN_TOKEN=รหัสลับยาวๆ ALLOW_ORIGIN=https://โดเมนร้าน node dexter_payment_server.js
// ตัวแปร: PORT (3000) | ADMIN_TOKEN (รหัสซิงค์ ไม่ตั้ง = ปิดฟีเจอร์ซิงค์) | ALLOW_ORIGIN (โดเมนเว็บร้าน)
//         DB_PATH (ไฟล์เก็บข้อมูลซิงค์ sync_db.json) | PHONE (เบอร์ทรูมันนี่สำรอง ปกติเว็บส่งมาเอง)
// หมายเหตุ: ซองทรูมันนี่ใช้ endpoint ไม่เป็นทางการ อาจเปลี่ยนได้ ทดสอบด้วยซองยอดเล็กก่อน
const http = require('http'), fs = require('fs'), crypto = require('crypto');
const PHONE = process.env.PHONE, PORT = process.env.PORT || 3000, ORIGIN = process.env.ALLOW_ORIGIN || '*';
const TOKEN = process.env.ADMIN_TOKEN || '', DB = process.env.DB_PATH || 'sync_db.json';
const FILE = process.env.VOUCHER_FILE || 'used_vouchers.json';
const used = new Set(fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : []);
const MSG = { VOUCHER_NOT_FOUND: 'ไม่พบซองนี้', VOUCHER_EXPIRED: 'ซองหมดอายุแล้ว', VOUCHER_OUT_OF_STOCK: 'ซองนี้ถูกรับไปแล้ว', TARGET_USER_REDEEMED: 'ซองนี้ถูกรับไปแล้ว', CANNOT_GET_OWN_VOUCHER: 'ไม่สามารถรับซองของตัวเองได้' };
const send = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS' }); res.end(JSON.stringify(o)); };
const readBody = (req, limit) => new Promise((ok, no) => { let b = '', n = 0; req.on('data', d => { n += d.length; if (n > limit) { req.destroy(); no(new Error('too big')); } else b += d; }); req.on('end', () => ok(b)); req.on('error', no); });
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const fails = new Map(); // กันเดารหัสซิงค์: ผิดเกิน 10 ครั้งใน 1 นาที ล็อกไอพีนั้น
function authed(req, res) {
  if (!TOKEN) { send(res, 503, { error: 'sync disabled' }); return false; }
  const ip = req.socket.remoteAddress, f = fails.get(ip);
  if (f && f.n >= 10 && Date.now() - f.t < 60000) { send(res, 429, { error: 'too many attempts' }); return false; }
  if (same((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), TOKEN)) { fails.delete(ip); return true; }
  fails.set(ip, { n: (f && Date.now() - f.t < 60000 ? f.n : 0) + 1, t: f && Date.now() - f.t < 60000 ? f.t : Date.now() });
  send(res, 401, { error: 'unauthorized' }); return false;
}
async function verify(res, q) {
  if (q.method !== 'tw') return send(res, 200, { success: false }); // สลิป PromptPay: ให้แอดมินอนุมัติเอง
  const m = String(q.voucher || '').match(/\?v=([0-9A-Za-z]{10,64})/);
  if (!m) return send(res, 200, { reject: true, message: 'ลิงก์ซองไม่ถูกต้อง' });
  const hash = m[1], phone = /^0\d{9}$/.test(q.phone || '') ? q.phone : PHONE;
  if (!/^0\d{9}$/.test(phone || '')) return send(res, 200, { success: false }); // ยังไม่ได้ตั้งเบอร์รับเงิน
  if (used.has(hash)) return send(res, 200, { reject: true, message: 'ซองนี้ถูกใช้แล้ว' });
  const r = await fetch(`https://gift.truemoney.com/campaign/vouchers/${hash}/redeem`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, body: JSON.stringify({ mobile: phone, voucher_hash: hash }) });
  const j = await r.json().catch(() => ({})), code = j.status && j.status.code;
  if (code === 'SUCCESS') {
    const amount = parseFloat(j.data && j.data.my_ticket && j.data.my_ticket.amount_baht);
    if (!(amount > 0)) return send(res, 200, { success: false });
    used.add(hash); fs.writeFileSync(FILE, JSON.stringify([...used]));
    return send(res, 200, { success: true, amount });
  }
  return send(res, 200, { reject: true, message: MSG[code] || 'ไม่สามารถรับซองนี้ได้' });
}
http.createServer(async (req, res) => {
  try {
    const url = req.url.split('?')[0];
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (url === '/health') return send(res, 200, { ok: true, sync: !!TOKEN });
    if (req.method === 'POST' && url === '/verify') return verify(res, JSON.parse(await readBody(req, 2e6)));
    if (url === '/state' && req.method === 'GET') {
      if (!authed(req, res)) return;
      return send(res, 200, fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, 'utf8')) : { ts: 0, data: null });
    }
    if (url === '/state' && req.method === 'PUT') {
      if (!authed(req, res)) return;
      const { data } = JSON.parse(await readBody(req, 40e6));
      if (!data || typeof data !== 'object' || !Array.isArray(data.prods)) return send(res, 400, { error: 'bad data' });
      const rec = { ts: Date.now(), data };
      if (fs.existsSync(DB)) fs.copyFileSync(DB, DB + '.bak'); // เก็บเวอร์ชันก่อนหน้าไว้ 1 ชุด
      fs.writeFileSync(DB + '.tmp', JSON.stringify(rec)); fs.renameSync(DB + '.tmp', DB);
      return send(res, 200, { ts: rec.ts });
    }
    send(res, 404, {});
  } catch (e) { console.error(e); send(res, 200, { success: false }); }
}).listen(PORT, () => console.log('server on :' + PORT + (TOKEN ? ' (sync on)' : ' (sync off: ตั้ง ADMIN_TOKEN เพื่อเปิด)')));
