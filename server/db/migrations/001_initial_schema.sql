CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE CHECK (email = LOWER(email)),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name VARCHAR(140) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_members (
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('freelancer', 'client')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE project_invites (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email VARCHAR(254) NOT NULL CHECK (email = LOWER(email)),
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE milestones (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status VARCHAR(24) NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'in_review', 'changes_requested', 'approved')),
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, project_id)
);

CREATE TABLE tasks (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  milestone_id BIGINT NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'in_review', 'done')),
  priority VARCHAR(12) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high')),
  assignee_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (milestone_id, project_id) REFERENCES milestones(id, project_id) ON DELETE CASCADE
);

CREATE INDEX projects_owner_updated_idx ON projects (owner_id, updated_at DESC);
CREATE INDEX project_members_user_idx ON project_members (user_id, project_id);
CREATE INDEX project_invites_project_expires_idx ON project_invites (project_id, expires_at);
CREATE INDEX milestones_project_due_idx ON milestones (project_id, due_date);
CREATE INDEX tasks_project_status_due_idx ON tasks (project_id, status, due_date);
CREATE INDEX tasks_assignee_status_idx ON tasks (assignee_id, status);
