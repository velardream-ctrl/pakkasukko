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

-- Immutable submission-time tariff, separate from editable operational notes.
CREATE TABLE IF NOT EXISTS booking_quotes (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
 snapshot TEXT NOT NULL, summary TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trip_shares (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id), trip_id TEXT NOT NULL,
 participants INTEGER NOT NULL, pool INTEGER NOT NULL, share INTEGER NOT NULL, departed TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invoices (
 number INTEGER PRIMARY KEY AUTOINCREMENT, booking_id TEXT UNIQUE NOT NULL REFERENCES bookings(id),
 document TEXT NOT NULL, sent_at TEXT
);
CREATE TABLE IF NOT EXISTS booking_submissions (
 token TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL
);

-- RUN-034: an inserted audit row is an atomic reschedule command.
CREATE TABLE IF NOT EXISTS booking_moves (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES bookings(id),
 old_slot TEXT NOT NULL REFERENCES slots(id), new_slot TEXT NOT NULL,
 old_start TEXT NOT NULL, old_end TEXT NOT NULL, new_start TEXT NOT NULL, new_end TEXT NOT NULL,
 release_old INTEGER NOT NULL CHECK(release_old IN(0,1)), created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS booking_moves_booking_idx ON booking_moves(booking_id,created_at);
CREATE TRIGGER IF NOT EXISTS booking_move_validate BEFORE INSERT ON booking_moves
BEGIN
 SELECT CASE WHEN NOT EXISTS(
   SELECT 1 FROM bookings b JOIN slots s ON s.id=b.slot_id LEFT JOIN booking_details d ON d.booking_id=b.id
   WHERE b.id=NEW.booking_id AND b.slot_id=NEW.old_slot AND s.start_at=NEW.old_start AND s.end_at=NEW.old_end
   AND b.status IN('pending','confirmed') AND d.final_status IS NULL
   AND (b.status='pending' OR (s.status='reserved' AND s.booking_id=b.id))
 ) THEN RAISE(ABORT,'stale booking') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM invoices WHERE booking_id=NEW.booking_id)
   OR EXISTS(SELECT 1 FROM trip_shares WHERE booking_id=NEW.booking_id) THEN RAISE(ABORT,'locked booking') END;
 SELECT CASE WHEN substr(NEW.old_start,1,10)<>substr(NEW.new_start,1,10)
 AND EXISTS(SELECT 1 FROM booking_quotes WHERE booking_id=NEW.booking_id AND coalesce(json_extract(snapshot,'$.groupSize'),1)>1)
 THEN RAISE(ABORT,'group date locked') END;
 SELECT CASE WHEN NEW.old_slot=NEW.new_slot OR NEW.new_end<=NEW.new_start
 OR EXISTS(SELECT 1 FROM slots WHERE id<>NEW.new_slot AND start_at<NEW.new_end AND end_at>NEW.new_start)
 OR EXISTS(SELECT 1 FROM slots WHERE id=NEW.new_slot AND (status<>'open' OR start_at<>NEW.new_start OR end_at<>NEW.new_end))
 OR EXISTS(SELECT 1 FROM bookings b LEFT JOIN booking_details d ON d.booking_id=b.id WHERE b.slot_id=NEW.new_slot AND b.status IN('pending','confirmed') AND d.final_status IS NULL)
 THEN RAISE(ABORT,'slot unavailable') END;
END;
CREATE TRIGGER IF NOT EXISTS booking_move_apply AFTER INSERT ON booking_moves
BEGIN
 INSERT INTO slots(id,start_at,end_at,status,note,created_at)
 SELECT NEW.new_slot,NEW.new_start,NEW.new_end,'open','',NEW.created_at
 WHERE NOT EXISTS(SELECT 1 FROM slots WHERE id=NEW.new_slot);
 UPDATE bookings SET slot_id=NEW.new_slot WHERE id=NEW.booking_id;
 UPDATE slots SET status=CASE WHEN NEW.release_old=1 THEN 'open' ELSE 'blocked' END,booking_id=NULL
 WHERE id=NEW.old_slot AND booking_id=NEW.booking_id;
 UPDATE slots SET status='reserved',booking_id=NEW.booking_id
 WHERE id=NEW.new_slot AND EXISTS(SELECT 1 FROM bookings WHERE id=NEW.booking_id AND status='confirmed');
END;

-- RUN-036: only cancelled/declined, non-financial bookings can be deleted.
CREATE TRIGGER IF NOT EXISTS booking_delete_guard BEFORE DELETE ON bookings
BEGIN
 SELECT CASE WHEN OLD.status<>'declined' AND NOT EXISTS(SELECT 1 FROM booking_details WHERE booking_id=OLD.id AND final_status='cancelled')
 THEN RAISE(ABORT,'booking active') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM invoices WHERE booking_id=OLD.id) OR EXISTS(SELECT 1 FROM trip_shares WHERE booking_id=OLD.id)
 THEN RAISE(ABORT,'booking financial lock') END;
 DELETE FROM booking_moves WHERE booking_id=OLD.id;
 DELETE FROM booking_quotes WHERE booking_id=OLD.id;
 DELETE FROM booking_details WHERE booking_id=OLD.id;
 UPDATE slots SET status='open',booking_id=NULL WHERE booking_id=OLD.id AND status='reserved';
END;

-- RUN-037: delivery requests are independent of visit slots.
CREATE TABLE IF NOT EXISTS video_orders (
 id TEXT PRIMARY KEY, service_id TEXT NOT NULL, service TEXT NOT NULL,
 delivery_date TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL,
 phone TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '',
 price_label TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
 CHECK(status IN('pending','confirmed','completed','cancelled','declined')),
 notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
 submission_key TEXT UNIQUE, fingerprint TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS video_orders_delivery_idx ON video_orders(delivery_date,status);
 

-- Advance invoices: separate consecutive series A-n, never confuse a bank promise with money received.
CREATE TABLE IF NOT EXISTS prepayment_requests (
 number INTEGER PRIMARY KEY AUTOINCREMENT,
 booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),
 amount INTEGER NOT NULL CHECK(amount>0 AND amount<=10000000),
 refunded_amount INTEGER NOT NULL DEFAULT 0 CHECK(refunded_amount>=0 AND refunded_amount<=amount),
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN('requested','paid','refunded')),
 document TEXT NOT NULL,
 issued_at TEXT NOT NULL, due_date TEXT NOT NULL,
 paid_at TEXT, refunded_at TEXT, sent_at TEXT, bank_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS prepayment_requests_status_idx ON prepayment_requests(status);
CREATE TABLE IF NOT EXISTS prepayment_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 booking_id TEXT NOT NULL REFERENCES bookings(id),
 action TEXT NOT NULL CHECK(action IN('requested','paid','refunded')),
 amount INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS prepayment_prevent_delete BEFORE DELETE ON bookings
WHEN EXISTS(SELECT 1 FROM prepayment_requests WHERE booking_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'booking financial lock'); END;
CREATE TRIGGER IF NOT EXISTS prepayment_prevent_move BEFORE INSERT ON booking_moves
WHEN EXISTS(SELECT 1 FROM prepayment_requests WHERE booking_id=NEW.booking_id)
BEGIN SELECT RAISE(ABORT,'locked booking'); END;

-- Stripe-hosted checkout links are created only after the owner issues an advance invoice.
-- Multiple attempts are retained for audit; Stripe payment confirmation comes from a signed webhook.
CREATE TABLE IF NOT EXISTS stripe_checkouts (
 id TEXT PRIMARY KEY,
 booking_id TEXT NOT NULL REFERENCES bookings(id),
 amount INTEGER NOT NULL CHECK(amount>0),
 checkout_url TEXT NOT NULL, expires_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','paid')),
 payment_intent TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS stripe_checkouts_booking_idx ON stripe_checkouts(booking_id,created_at);
CREATE INDEX IF NOT EXISTS stripe_checkouts_intent_idx ON stripe_checkouts(payment_intent);

CREATE TABLE IF NOT EXISTS gift_codes (
 code TEXT PRIMARY KEY, kind TEXT NOT NULL, value INTEGER NOT NULL,
 state TEXT NOT NULL, expires TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gift_redemptions (
 code TEXT PRIMARY KEY REFERENCES gift_codes(code), booking_id TEXT NOT NULL UNIQUE, redeemed_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS gift_redemption_available
BEFORE INSERT ON gift_redemptions
WHEN NOT EXISTS (
 SELECT 1 FROM gift_codes WHERE code=NEW.code AND state IN ('gifted','published')
 AND (expires IS NULL OR expires>=date('now'))
)
BEGIN
 SELECT RAISE(ABORT,'gift code unavailable');
END;
