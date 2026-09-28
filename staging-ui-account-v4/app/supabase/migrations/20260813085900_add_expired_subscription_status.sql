-- Kept separate so PostgreSQL can commit the new enum value before later
-- migrations use it in functions and policies.
alter type marginflow.subscription_status add value if not exists 'expired';
