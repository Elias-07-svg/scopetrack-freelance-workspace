# ScopeTrack

ScopeTrack is a portfolio project for organizing freelance work with clients. Freelancers create projects, plan milestones and tasks, invite clients, and send milestones for review. Clients can approve a delivery or request changes.

This is an independent learning and portfolio project, not professional employment experience.

## MVP features

- Account registration, sign-in, and sign-out
- PostgreSQL-backed sessions with HTTP-only cookies
- Scrypt password hashing using Node's built-in crypto module
- Project creation and project-scoped freelancer/client roles
- Seven-day, single-use client invitation links tied to the invited email
- Milestones and tasks, due dates, task priority and status
- Milestone review, approval, and change-request workflow
- Responsive workspace, project overview, collaborator list, and empty states
- API-side access checks on every project operation

## Stack

- **Client:** React, Vite, JavaScript, responsive CSS
- **API:** Node.js, Express, REST
- **Database:** PostgreSQL with additive SQL migrations
- **Authentication:** scrypt password hashes and opaque server-side sessions
- **Authorization:** project membership roles checked on each protected request

## Run locally

Requirements: Node.js 20.19+ and a PostgreSQL database. Keep database credentials private and use a connection string with a current password.

1. In `server/`, create `.env` from `.env.example`. Set `DATABASE_URL` to your PostgreSQL connection string and set `SESSION_SECRET` to a long random value. Keep `.env` private.
2. Open a terminal in `server/` and run:

   ```sh
   npm install
   npm run db:migrate
   npm run dev
   ```

3. Open a second terminal in `client/` and run:

   ```sh
   npm install
   npm run dev
   ```

4. Open the client URL Vite prints (normally `http://localhost:5173`). Create an account, create a project, add a milestone and tasks, then try the workflow.

The API is at `http://localhost:4000`. Its health endpoint is `http://localhost:4000/api/health`. Vite forwards `/api` requests to the API during local development.

Migrations are safe to run more than once. Migration `001_initial_schema.sql` creates the project data tables; migration `002_sessions.sql` adds persistent login sessions. The migration runner skips versions already recorded in `schema_migrations`.

## Client invitation flow

From a project, select **Invite client** and enter the client's email. The app creates a single-use link that expires after seven days. Send that link privately. The invitee signs in or creates an account using the same email to join. This MVP creates a link but does not send email automatically.

## Workflow rules

- A project creator is its `freelancer` member.
- Only project members can view that project's data.
- Only a freelancer member can invite clients, add milestones/tasks, and update task status.
- A freelancer moves a milestone from planned to in progress and then submits it for review.
- A client can approve a milestone in review or request changes.
- A freelancer can resume a changes-requested milestone.
- A person's project role is scoped to each membership, so they can have different roles in different projects.

## Deployment notes

The Render Blueprint in `render.yaml` builds the Vite client and serves it from the Express service. Add `DATABASE_URL` as a private Render environment value; Render generates a unique `SESSION_SECRET`. The API health check is `/api/health`.

Use a private hosted PostgreSQL database. Never put server secrets in the client or commit `.env`. After changing any secret, update the hosting environment too. The public demo must use HTTPS so production session cookies remain secure.

## Later ideas

Messaging, in-app notifications, attachments, time tracking, invoices, calendar views, activity history, and subscription billing are intentionally outside this first usable MVP.
