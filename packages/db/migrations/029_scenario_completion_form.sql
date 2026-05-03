-- Send a selected form automatically when a scenario finishes.
ALTER TABLE scenarios ADD COLUMN on_completion_form_id TEXT REFERENCES forms (id) ON DELETE SET NULL;
