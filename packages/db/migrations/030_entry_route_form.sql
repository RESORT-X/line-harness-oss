-- Link a friend-add entry route to an optional form.
ALTER TABLE entry_routes ADD COLUMN form_id TEXT REFERENCES forms (id) ON DELETE SET NULL;
