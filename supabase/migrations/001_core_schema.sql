-- Core database setup for MarginFlow.
-- This migration only prepares shared schema objects; it does not create application tables.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists marginflow;

comment on schema marginflow is 'Shared MarginFlow schema for future Supabase-backed data.';
