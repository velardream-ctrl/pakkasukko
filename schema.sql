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
CREATE TABLE IF NOT EXISTS site_revisions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL, published INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media (
 id TEXT PRIMARY KEY, mime TEXT NOT NULL, caption TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0
);
CREATE TRIGGER IF NOT EXISTS slot_insert_guard BEFORE INSERT ON slots
WHEN EXISTS(SELECT 1 FROM slots WHERE start_at<NEW.end_at AND end_at>NEW.start_at)
BEGIN SELECT RAISE(ABORT,'slot overlap'); END;
CREATE TRIGGER IF NOT EXISTS slot_update_guard BEFORE UPDATE OF start_at,end_at ON slots
WHEN EXISTS(SELECT 1 FROM slots WHERE id<>NEW.id AND start_at<NEW.end_at AND end_at>NEW.start_at)
BEGIN SELECT RAISE(ABORT,'slot overlap'); END;
CREATE TABLE IF NOT EXISTS booking_details (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id), price TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '', final_status TEXT CHECK(final_status IN ('completed','cancelled'))
);
CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE TRIGGER IF NOT EXISTS reserve_booking BEFORE UPDATE OF status ON bookings
WHEN NEW.status='confirmed' AND OLD.status='pending'
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM slots WHERE id=NEW.slot_id AND status='open') THEN RAISE(ABORT,'slot unavailable') END;
 UPDATE slots SET status='reserved',booking_id=NEW.id WHERE id=NEW.slot_id;
END;
CREATE TRIGGER IF NOT EXISTS cancel_booking AFTER UPDATE OF final_status ON booking_details
WHEN NEW.final_status='cancelled'
BEGIN UPDATE slots SET status='open',booking_id=NULL WHERE booking_id=NEW.booking_id; END;
CREATE TRIGGER IF NOT EXISTS cancel_booking_insert AFTER INSERT ON booking_details
WHEN NEW.final_status='cancelled'
BEGIN UPDATE slots SET status='open',booking_id=NULL WHERE booking_id=NEW.booking_id; END;

-- RUN-017: owner-controlled booking launch, OFF by default on every new database.
CREATE TABLE IF NOT EXISTS booking_settings (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL
);
