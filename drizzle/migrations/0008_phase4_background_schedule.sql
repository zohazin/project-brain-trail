create extension if not exists pg_cron;
select cron.schedule('cheez-due-events', '0 * * * *', 'select public.process_due_events()');