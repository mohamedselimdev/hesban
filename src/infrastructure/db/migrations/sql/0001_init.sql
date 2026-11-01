-- 0001_init: application metadata and settings.
-- schema_migrations itself is created by the runner before any migration runs.

create table app_meta (
  key text primary key,
  value text not null
) strict;

create table settings (
  key text primary key,
  value_json text not null,
  updated_at text not null,
  updated_by integer
) strict;
