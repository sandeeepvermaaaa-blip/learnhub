# LearnHub
Full-stack educational website with student accounts, profiles, courses, enrollments, contact messages and admin dashboard.

## Local setup
1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set `DATABASE_URL` to your Neon PostgreSQL connection string.
5. Set `JWT_SECRET` to a long random secret (at least 32 characters).
6. Set `ADMIN_EMAIL` to the email you will use for the admin account.
7. Run `npm start`, then open http://localhost:3000.

Database tables and sample courses are created automatically. Do not upload `.env` to GitHub.
