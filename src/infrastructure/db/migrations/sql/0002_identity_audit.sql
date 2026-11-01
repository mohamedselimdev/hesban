-- 0002_identity_audit: users, tamper-evident audit log, idempotency log.

create table users (
  id integer primary key,
  uuid text not null unique,
  username text not null collate nocase unique,
  display_name text not null,
  role text not null check (role in ('owner', 'manager', 'cashier')),
  password_hash text not null,
  pin_hash text,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until text,
  is_active integer not null default 1 check (is_active in (0, 1)),
  must_change_password integer not null default 0 check (must_change_password in (0, 1)),
  created_at text not null,
  updated_at text not null
) strict;

-- Users are never deleted, only deactivated.
create trigger users_no_delete before delete on users
begin
  select raise(abort, 'users cannot be deleted; deactivate instead');
end;

-- The last active owner can be neither demoted nor deactivated.
create trigger users_keep_last_owner before update on users
when old.role = 'owner' and old.is_active = 1 and (new.role <> 'owner' or new.is_active = 0)
begin
  select raise(abort, 'the last active owner cannot be demoted or deactivated')
  where (select count(*) from users where role = 'owner' and is_active = 1 and id <> old.id) = 0;
end;

create table audit_log (
  id integer primary key,
  at text not null,
  actor_id integer references users(id),
  action text not null,
  entity_type text,
  entity_id text,
  details_json text not null default '{}',
  prev_hash text not null,
  hash text not null unique
) strict;

create index ix_audit_at on audit_log(at);
create index ix_audit_entity on audit_log(entity_type, entity_id);

create trigger audit_no_update before update on audit_log
begin
  select raise(abort, 'audit_log rows are immutable');
end;

create trigger audit_no_delete before delete on audit_log
begin
  select raise(abort, 'audit_log rows are immutable');
end;

-- Every new row must link to the hash of the previous row ('GENESIS' for the first one).
create trigger audit_chain_link before insert on audit_log
when new.prev_hash <> coalesce((select hash from audit_log order by id desc limit 1), 'GENESIS')
begin
  select raise(abort, 'audit_log chain link does not match the previous row');
end;

create table command_log (
  id integer primary key,
  command_id text not null unique,
  command_type text not null,
  actor_id integer references users(id),
  result_json text not null,
  created_at text not null
) strict;

create trigger command_log_no_update before update on command_log
begin
  select raise(abort, 'command_log rows are immutable');
end;

create trigger command_log_no_delete before delete on command_log
begin
  select raise(abort, 'command_log rows are immutable');
end;
