-- Data minimisation: hosts are identified by a Google subject id and a display name only.
ALTER TABLE users DROP COLUMN email;
ALTER TABLE users DROP COLUMN picture;

-- Accessibility: every question image carries alt text.
ALTER TABLE questions ADD COLUMN image_alt TEXT NOT NULL DEFAULT '';
