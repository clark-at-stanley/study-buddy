# Study Buddy

A small static website that organizes the study tools we build during the year.
Subjects on top (Spanish, History, Science, …), each with its own page listing
tools grouped by topic and sorted by date.

Everything is plain HTML/CSS/JS. No build step is required for day-to-day use,
no server, and it works offline once a page has loaded.

---

## What's in here

```
index.html               The whole site: filter tiles + list of all tools
tools.js                  ← THE ONLY FILE YOU EDIT to add tools/subjects
assets/site.css           Home-page styles (tiles + tool list)
assets/render.js          Builds the home page from tools.js
assets/study.css          Shared styles for the study tools
assets/study-engine.js    Shared engine that powers every tool
_template/tool.html       Starter you copy to make a new tool
tools/<subject>/...       The actual study tool .html files
STANDARD.md / CHECKLIST.md  The build standard and pre-publish checklist
```

There is a single page (`index.html`). Subjects are filter tiles across the top;
clicking one shows just that subject's tools. There are no per-subject pages to
maintain.

---

## Put it online with GitHub Pages (free)

You only do this setup once.

1. **Make a GitHub account** at github.com if you don't have one.
2. **Create a new repository.** Name it whatever you like (e.g. `study-buddy`).
   Leave it **Public** (required for free GitHub Pages).
3. **Upload the files.** On the repo page click **Add file → Upload files**,
   then drag in *everything inside this `site` folder* (the `index.html`,
   `tools.js`, the `assets` folder, the `tools` folder, etc.). Commit.
4. **Turn on Pages.** Go to the repo's **Settings → Pages**. Under
   "Build and deployment", set **Source = Deploy from a branch**, pick the
   **main** branch and the **/ (root)** folder, and **Save**.
5. Wait ~1 minute. Your site is live at:
   `https://<your-username>.github.io/<repo-name>/`

That's it. Bookmark that URL on your kids' devices.

> Tip: a custom domain (e.g. `study.ourfamily.com`) is optional and can be added
> later under Settings → Pages if you ever buy one.

---

## Add a new study tool (the common case)

1. Copy `_template/tool.html` to `tools/<subject>/<name>.html` and fill in its
   content block (see the comments in that file).
   Example: `tools/spanish/verbs.html`
2. Open **`tools.js`** and add one entry to that subject's `tools` list:

   ```js
   { title: "Ser vs. Estar", topic: "Grammar",
     file: "tools/spanish/verbs.html", date: "2026-09-20",
     note: "When to use each." }
   ```
3. Upload the new file + the edited `tools.js` to GitHub (Add file → Upload files,
   or edit `tools.js` directly on github.com with the pencil icon). Done — the
   home page updates itself.

No need to touch any HTML on the home page. It reads `tools.js` automatically.

### Marking a tool as done

When a test is over, add `status: "done"` to that tool's entry in `tools.js`:

```js
{ title: "Cell Biology Review", topic: "Cell Biology",
  file: "tools/science/cell-biology.html", date: "2026-09-02",
  status: "done", note: "..." }
```

The home page has an **Active / All** filter. "All" (the default) shows two
sections — Active first, then Done (dimmed). "Active" hides the done tools so she
can focus on what's current. Remove the `status` line to make a tool active again.

---

## Add a new subject (less common)

1. Add a subject block to `tools.js`:

   ```js
   {
     id: "history",             // url-safe id (also used in tool file paths)
     name: "History",           // shown on the filter tile
     accent: "#4c7a5a",         // the subject's stripe + tile color
     tools: []
   }
   ```
2. Make a folder for its tools: `tools/history/`.
3. Upload the changes. A "History" filter tile appears automatically — there is
   no page to create.

---

## Notes

- **Progress saving:** each study tool saves a student's progress in that
  browser on that device (nothing is uploaded anywhere). Different device or
  browser = separate progress.
- **Dates** use the format `YYYY-MM-DD` and control the sort order within a topic
  (newest first). They're also shown on each tool.
- **Offline:** once a page has loaded in a browser it keeps working without a
  connection. To study offline, open it once while online first.
