INSERT INTO "platform_configs" ("id", "key", "label", "target", "value_type", "value", "description", "is_active")
VALUES
  ('platform-config-course-tutor', 'course_tutor_split', 'Course Tutor Split', 'tutor', 'percentage', '75', 'Tutor share for paid course purchases', true),
  ('platform-config-course-welfare', 'course_welfare_split', 'Course Welfare Split', 'welfare', 'percentage', '10', 'Welfare share for paid course purchases', true),
  ('platform-config-course-platform-fee', 'course_platform_fee', 'Course Platform Fee', 'platform_fee', 'percentage', '15', 'Platform fee for paid course purchases', true)
ON CONFLICT ("key") DO NOTHING;
