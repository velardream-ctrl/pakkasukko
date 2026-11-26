import {giftKinds} from '../docs/gift-codes.js';

export function normalizeGiftCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  return /^[A-Z0-9-]{6,64}$/.test(code) ? code : '';
}

export async function availableGiftCode(db, value) {
  const code = normalizeGiftCode(value);
  if (!code) return null;
  return await db.prepare(`SELECT code,kind,value,expires FROM gift_codes
    WHERE code=? AND state IN ('gifted','published') AND (expires IS NULL OR expires>=date('now'))
    AND NOT EXISTS (SELECT 1 FROM gift_redemptions WHERE code=gift_codes.code)`).bind(code).first();
}

export async function giftAdmin(req, db, reply) {
  if (req.method === 'GET') {
    const {results} = await db.prepare(`SELECT c.*, r.booking_id FROM gift_codes c
      LEFT JOIN gift_redemptions r ON r.code=c.code ORDER BY c.created_at DESC LIMIT 300`).all();
    return reply({codes:results});
  }
  const input = await req.json();
  const code = normalizeGiftCode(input.code);
  if (input.action === 'disable') {
    if (!code) return reply({error:'Неверный код.'},400);
    await db.prepare("UPDATE gift_codes SET state='disabled' WHERE code=?").bind(code).run();
    return reply({ok:true});
  }
  const {kind, expires, state} = input;
  const value = Number(input.value);
  const max = kind === 'percent' ? 100 : 100000;
  if (!Object.hasOwn(giftKinds,kind) || !['gifted','published'].includes(state) ||
      !Number.isInteger(value) || value < 0 || value > max ||
      (['percent','fixed','certificate'].includes(kind) && value === 0) ||
      (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires))) return reply({error:'Проверьте условия кода.'},400);
  const generated = 'PK-' + crypto.randomUUID().replaceAll('-','').slice(0,20).toUpperCase();
  await db.prepare('INSERT INTO gift_codes(code,kind,value,state,expires,created_at) VALUES(?,?,?,?,?,?)')
    .bind(generated,kind,value,state,expires || null,new Date().toISOString()).run();
  return reply({code:generated},201);
}
