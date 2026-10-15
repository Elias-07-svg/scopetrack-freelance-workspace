-- Firebase owns credentials and email verification. Keep the existing numeric
-- user IDs so current projects, milestones, tasks, and memberships stay intact.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN firebase_uid TEXT UNIQUE;
