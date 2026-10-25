-- Baseline migration (Phase 0).
-- Creates no domain objects. It exists so that the migration pipeline
-- (drizzle-kit -> migrate -> drizzle.__drizzle_migrations) is exercised against
-- the real database before the first domain table arrives in Phase 1.
SELECT 1;
