# Earned

A calm, banking-style ledger for four agreed tasks, with a password-protected
parent portal and a read-only progress view for LieLie.

| Address | Who it's for | What it does |
| --- | --- | --- |
| `/` | LieLie (public link) | Read-only: balance, monthly progress, today's tasks, activity, calendar, bonus ladder. Refreshes every minute. No notes, correction reasons or history are sent to this page. |
| `/demo` | Anyone | The whole app with sample data, switchable between the parent and LieLie views. Nothing is saved. |
| `/parent` | Parent (password) | Tick off tasks, correct or excuse days, choose college days, record payments, close months, change values, export/import/erase. |

The parent password is **`Vermont2527`**. It is checked on the server, so it
never appears in the pages' source code.

## Project layout

```
public/            static site (index.html = LieLie's view, parent.html = portal)
  calc.js          reward rules: occurrences, caps, excusals, bonus ladder, payments
  app.js, app.css  shared front end
netlify/functions/ API: /api/login, /api/state (parent only), /api/public (read-only)
netlify/lib/       storage, sessions, validation
tests/             reward-rule tests and server tests
scripts/           local dev server
```

Data is stored in **Netlify Blobs**, which every Netlify site has without setup.
Money is stored as whole pence. Dates use Europe/London.

## Deploy to Netlify

Netlify Drop (drag-and-drop) doesn't run functions, so use one of these:

**Option A: from GitHub (recommended)**
1. Put this folder in a new GitHub repository.
2. In Netlify: **Add new site → Import an existing project**, and pick the repository.
   The settings are read from `netlify.toml`, so leave them as they are.
3. Deploy. Every push redeploys, and the tests run first. A failing test stops the deploy.

**Option B: from your computer**
```bash
npm install
npx netlify-cli login
npx netlify-cli deploy --build --prod
```

### Recommended environment variables
Set these in **Site configuration → Environment variables**, then redeploy:

- `SESSION_SECRET`: any long random string. It signs the parent sign-in
  cookie. If you don't set it, one is derived from the password.
- `PARENT_PASSWORD` (optional): replaces the built-in password
  without editing code.

Changing either one signs out every device that is signed in.

## Run locally

```bash
npm install
npm run dev     # http://localhost:8888 and http://localhost:8888/parent
npm test        # 60 reward-rule checks + 9 server checks
```

The local server keeps data in memory and loses it when you stop the server.
`npx netlify-cli dev` runs the same site against real Netlify Blobs.

## First use

1. Open `/parent`, sign in, and choose **Start fresh**. The ledger starts today.
   You can change the start date in **Tasks and values**.
2. Pick the month's 16 college days.
3. Send LieLie the site's home address.

At the start of each month, choose that month's college days. After a month ends,
use **Close month** to make its bonus final and add it to *Still to pay*.

## Backups and reset

In the portal, go to **Plan → Backup and reset**:
- **Export** downloads everything as JSON.
- **Import** replaces all data with a valid backup. An invalid file is rejected
  and nothing changes.
- **Erase** deletes everything after you type `ERASE`.

## Privacy notes

- The home page is public to anyone with the link. It's marked `noindex`, so
  search engines are asked not to list it, but it isn't secret. It shows LieLie's
  first name, task names and amounts. It never shows medication details, notes,
  correction reasons or audit history.
- The portal's sign-in cookie is HTTP-only, secure and same-site. Wrong
  passwords are slowed down.
- No analytics or third-party scripts. The page loads the Inter font from Google Fonts.
