-- Enable pg_trgm extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Users: full name trigram index for fuzzy search
CREATE INDEX IF NOT EXISTS idx_users_name_trgm 
ON users USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

-- Subjects: name trigram index for fuzzy search
CREATE INDEX IF NOT EXISTS idx_subjects_name_trgm 
ON subjects USING gin (name gin_trgm_ops);