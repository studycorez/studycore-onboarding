alter table students
  add column if not exists parent_can_see_scores  boolean default true,
  add column if not exists parent_can_see_homework boolean default true,
  add column if not exists parent_can_see_xp       boolean default true;
