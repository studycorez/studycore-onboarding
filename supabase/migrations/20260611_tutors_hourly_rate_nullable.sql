-- /tutor-form (commit 397922f) no longer captures hourly_rate.
-- Admin sets the rate via the tutor profile page after hiring.
-- The column was previously NOT NULL; new tutors submitting via
-- /tutor-form fail with: null value in column "hourly_rate" violates
-- not-null constraint.

ALTER TABLE tutors ALTER COLUMN hourly_rate DROP NOT NULL;
