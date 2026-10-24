-- Runs once, when the local Docker volume is first initialised.
-- The test suite truncates every table it touches, so it gets its own database
-- rather than sharing the development one.
CREATE DATABASE leopay_test;
