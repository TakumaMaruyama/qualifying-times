DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'course' AND e.enumlabel = 'ANY'
  ) THEN
    ALTER TYPE "course" ADD VALUE 'ANY';
  END IF;
END $$;
