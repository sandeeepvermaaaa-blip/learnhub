# LearnHub — Full-stack educational website

A starter learning platform built with:
- **Frontend:** HTML, CSS and vanilla JavaScript
- **Backend:** Node.js + Express REST API
- **Database:** SQLite (stored locally in `data/learnhub.sqlite`)
- **Authentication:** bcrypt password hashing + signed JWT in an HttpOnly cookie

## Included features

- Student signup and login
- User profile (name and bio)
- Browse courses and enroll
- My Courses list
- Contact form saved to the database
- Admin dashboard with user/course/enrollment counts
- Admin can add/delete courses, view users and read contact messages
- Responsive design for mobile and desktop

## Requirements

- Node.js 20 or newer
- npm

## Run locally

1. Extract the ZIP.
2. Open a terminal in the extracted `learnhub_fullstack` folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Create your environment file:

   **Windows PowerShell**
   ```powershell
   Copy-Item .env.example .env
   ```

   **macOS/Linux**
   ```bash
   cp .env.example .env
   ```

5. Edit `.env` and set a long random `JWT_SECRET` (at least 32 characters). Set `ADMIN_EMAIL` to the email address you want to use for the administrator account.

   Example:
   ```env
   PORT=3000
   NODE_ENV=development
   JWT_SECRET=put-a-long-random-secret-here-at-least-32-chars
   ADMIN_EMAIL=you@example.com
   DB_FILE=./data/learnhub.sqlite
   ```

6. Start the website:

   ```bash
   npm start
   ```

7. Open **http://localhost:3000** in your browser.

## Create the administrator

- Set `ADMIN_EMAIL` in `.env` **before** registering.
- Sign up on the website using that exact email address.
- That account will receive the `admin` role.
- All other signups receive the `student` role.

If you already registered that email as a student, stop the server, back up the database and change that user's role in SQLite to `admin`, or use a fresh database. Do not expose an admin signup form publicly.

## Database

SQLite creates itself automatically at `data/learnhub.sqlite` on first run. Tables:
- `users`
- `courses`
- `enrollments`
- `messages`

Four sample courses are inserted automatically when the courses table is empty.

## API overview

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` | Public | Create account |
| POST | `/api/auth/login` | Public | Log in |
| POST | `/api/auth/logout` | Public | Log out |
| GET | `/api/me` | Signed in | Current user |
| PATCH | `/api/profile` | Signed in | Update profile |
| GET | `/api/courses` | Public | List courses |
| POST | `/api/courses/:id/enroll` | Signed in | Enroll |
| GET | `/api/my-courses` | Signed in | User's courses |
| POST | `/api/contact` | Public | Send contact message |
| GET | `/api/admin/overview` | Admin | Dashboard stats |
| GET | `/api/admin/users` | Admin | List users |
| GET | `/api/admin/messages` | Admin | List messages |
| POST | `/api/admin/courses` | Admin | Add course |
| DELETE | `/api/admin/courses/:id` | Admin | Delete course |

## Before deploying publicly

This is a functional starter project, not a fully audited production service. Before public launch:
- Use HTTPS and set `NODE_ENV=production`.
- Use a strong, unique `JWT_SECRET`; never commit `.env`.
- Configure database backups and persistent storage.
- Add CSRF protection appropriate to your deployment, email verification, password reset and monitoring.
- Consider managed database hosting and a persistent session/revocation strategy for a larger deployment.
- Update branding, course content and contact details.

## Notes

The default contact email displayed in the page is a placeholder (`hello@example.com`). Edit it in `public/index.html`.
