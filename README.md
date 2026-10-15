# ScopeTrack

ScopeTrack is a portfolio project for organizing freelance work with clients. Freelancers create projects, plan milestones and tasks, invite clients, and send milestones for review. Clients can approve a delivery or request changes.

This is an independent learning and portfolio project, not professional employment experience.

## MVP features

- Firebase email/password registration with inbox verification, Google sign-in, and sign-out
- Verified Firebase ID tokens checked by the Express API
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
- **Authentication:** Firebase Authentication for verified email/password and Google accounts
- **Authorization:** project membership roles checked on each protected request

## Run locally

Requirements: Node.js 24.12+, a PostgreSQL database, and a Firebase project with Email/Password and Google providers enabled. Keep database credentials private and use a connection string with a current password.

1. In `client/`, create `.env` from `.env.example` and copy the web app's Firebase config values into it. These `VITE_FIREBASE_*` values configure the browser SDK.
2. In `server/`, create `.env` from `.env.example`. Set `DATABASE_URL` to your PostgreSQL connection string and `FIREBASE_PROJECT_ID` to your Firebase project ID (`scopetrack-edca2`). Keep `.env` private.
3. Open a terminal in `server/` and run:

   ```sh
   npm install
   npm run db:migrate
   npm run dev
   ```

4. Open a second terminal in `client/` and run:

   ```sh
   npm install
   npm run dev
   ```

5. Open the client URL Vite prints (normally `http://localhost:5173`). Create an account and follow the real Firebase verification email, or continue with Google.

The API is at `http://localhost:4000`. Its health endpoint is `http://localhost:4000/api/health`. Vite forwards `/api` requests to the API during local development.

Migrations are safe to run more than once. Migration `004_firebase_auth.sql` links Firebase identities to existing database users and keeps numeric user IDs intact, so existing projects and memberships remain attached. The migration runner skips versions already recorded in `schema_migrations`.

For Render, set `FIREBASE_PROJECT_ID` on the API service and set all `VITE_FIREBASE_*` values on the web service before building. Add the Render hostname to Firebase Authentication's authorized domains. Firebase sends the verification email; the API verifies Firebase ID tokens before granting access to project data.

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

The Render Blueprint in `render.yaml` builds the Vite client and serves it from the Express service. Add `DATABASE_URL` as a private Render environment value. The API health check is `/api/health`.

Use a private hosted PostgreSQL database. Never put database credentials or server secrets in the client or commit `.env`. Firebase web configuration is intended to be included in browser apps; the API independently verifies signed Firebase ID tokens. Add both `localhost` and the Render hostname to Firebase Authentication's authorized domains for local and hosted sign-in.

## Later ideas

Messaging, in-app notifications, attachments, time tracking, invoices, calendar views, activity history, and subscription billing are intentionally outside this first usable MVP.
