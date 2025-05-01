-- USERS
CREATE TABLE tbl_users (
  user_id      TEXT PRIMARY KEY,
  first_name   TEXT NOT NULL,
  last_name    TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  password     TEXT NOT NULL,        -- bcrypt hash, etc.
  user_type    TEXT NOT NULL CHECK(user_type IN ('student', 'teacher')),
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login   DATETIME
);

-- COURSES
CREATE TABLE tbl_courses (
  course_id      TEXT PRIMARY KEY,
  course_name    TEXT NOT NULL,
  course_number  TEXT NOT NULL,
  course_section TEXT NOT NULL,
  course_term    TEXT NOT NULL,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL
);

-- ENROLLMENTS (join table between users & courses)
CREATE TABLE tbl_enrollments (
  course_id TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  PRIMARY KEY (course_id, user_id),
  FOREIGN KEY (course_id) REFERENCES tbl_courses(course_id)
    ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES tbl_users(user_id)
    ON DELETE CASCADE
);

-- PHONE NUMBERS
CREATE TABLE tbl_phone (
  phone_id     TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  nation_code  TEXT NOT NULL,
  area_code    TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  status       TEXT NOT NULL CHECK(status IN ('active','inactive')) DEFAULT 'active',
  FOREIGN KEY (user_id) REFERENCES tbl_users(user_id)
    ON DELETE CASCADE
);

-- SOCIAL ACCOUNTS
CREATE TABLE tbl_socials (
  social_id   TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  social_type TEXT NOT NULL,    -- e.g. 'twitter','github'
  username    TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES tbl_users(user_id)
    ON DELETE CASCADE
);

-- ASSESSMENTS
CREATE TABLE tbl_assessments (
  assessment_id TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL,
  user_id       TEXT NOT NULL,    -- creator/owner
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,  -- 'quiz','survey', etc.
  status        TEXT NOT NULL CHECK(status IN ('pending','open','closed'))
                   DEFAULT 'pending',
  start_time    DATETIME NOT NULL,
  end_time      DATETIME NOT NULL,
  FOREIGN KEY (course_id) REFERENCES tbl_courses(course_id)
    ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES tbl_users(user_id)
    ON DELETE CASCADE
);

-- ASSESSMENT QUESTIONS
CREATE TABLE tbl_assessment_questions (
  assessment_question_id TEXT PRIMARY KEY,
  assessment_id          TEXT NOT NULL,
  question_type          TEXT NOT NULL,    -- e.g. 'multiple_choice'
  options                TEXT,         -- JSON or delimited
  question_text          TEXT NOT NULL,
  helper_text            TEXT,
  FOREIGN KEY (assessment_id)
    REFERENCES tbl_assessments(assessment_id)
    ON DELETE CASCADE
);

-- ASSESSMENT RESPONSES
CREATE TABLE tbl_assessment_responses (
  assessment_response_id TEXT PRIMARY KEY,
  assessment_id          TEXT NOT NULL,
  user_id                TEXT NOT NULL,    -- who answered
  target_user_id         TEXT,        -- if peer review
  question_id            TEXT NOT NULL,    -- refers to assessment_question_id
  response_text          TEXT NOT NULL,
  visibility             TEXT NOT NULL CHECK(visibility IN ('public','private'))
                            DEFAULT 'private',
  FOREIGN KEY (assessment_id)
    REFERENCES tbl_assessments(assessment_id)
    ON DELETE CASCADE,
  FOREIGN KEY (user_id)
    REFERENCES tbl_users(user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (target_user_id)
    REFERENCES tbl_users(user_id)
    ON DELETE SET NULL,
  FOREIGN KEY (question_id)
    REFERENCES tbl_assessment_questions(assessment_question_id)
    ON DELETE CASCADE
);

-- COURSE GROUPS
CREATE TABLE tbl_course_groups (
  course_group_id TEXT PRIMARY KEY,
  course_id       TEXT NOT NULL,
  group_name      TEXT NOT NULL,
  FOREIGN KEY (course_id)
    REFERENCES tbl_courses(course_id)
    ON DELETE CASCADE
);

-- GROUP MEMBERS
CREATE TABLE tbl_group_members (
  group_id TEXT NOT NULL,  -- refers to tbl_course_groups.course_group_id
  user_id  TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id)
    REFERENCES tbl_course_groups(course_group_id)
    ON DELETE CASCADE,
  FOREIGN KEY (user_id)
    REFERENCES tbl_users(user_id)
    ON DELETE CASCADE
);

-- SESSIONS
CREATE TABLE tbl_sessions (
  session_id        TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  start_datetime    DATETIME NOT NULL,
  last_used_datetime DATETIME NOT NULL,
  status            TEXT NOT NULL CHECK(status IN ('active','expired','revoked'))
                      DEFAULT 'active',
  FOREIGN KEY (user_id)
    REFERENCES tbl_users(user_id)
    ON DELETE CASCADE
);

-- LOGS
CREATE TABLE tbl_logs (
  log_id      TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  log_type    TEXT NOT NULL CHECK(log_type IN ('error','info','warning','debug')),
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);