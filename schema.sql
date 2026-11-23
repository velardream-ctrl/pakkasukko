PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS slots (
 id TEXT PRIMARY KEY, start_at TEXT NOT NULL, end_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','blocked','reserved')),
 note TEXT NOT NULL DEFAULT '', booking_id TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS slots_start_idx ON slots(start_at);
CREATE TABLE IF NOT EXISTS bookings (
 id TEXT PRIMARY KEY, slot_id TEXT NOT NULL REFERENCES slots(id),
 service TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL,
 email TEXT NOT NULL DEFAULT '', city TEXT NOT NULL, address TEXT NOT NULL,
 message TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','confirmed','declined')),
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bookings_slot_idx ON bookings(slot_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status);
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT NOT NULL,
 message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unread',
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS content (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attempts (kind TEXT NOT NULL, ip_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS attempts_idx ON attempts(kind,ip_hash,created_at);