-- Phase D completion: the better-auth user table now owns the staff identity
-- FK. The temporary auth.users compatibility table is no longer needed.
--
-- This intentionally does not use CASCADE: a remaining dependency means the
-- FK cutover did not happen correctly and must stop the deployment.

DROP TABLE IF EXISTS auth.users;
DROP SCHEMA IF EXISTS auth;
