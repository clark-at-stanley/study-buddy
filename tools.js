/* =============================================================================
   STUDY TOOLS — SITE CONFIG
   This is the ONLY file you edit to add a new study tool or subject.
   Everything on the home page (filter tiles + tool list) is built from this.

   HOW TO ADD A TOOL
   -----------------
   1. Save the tool's .html file under  tools/<subject>/<name>.html
      e.g.  tools/math/fractions.html
   2. Add an entry to the matching subject's "tools" array below.
   3. Commit & push (or drag the folder to your host). Done.

   FIELD REFERENCE (per tool)
   --------------------------
   title    Shown to the student. Keep it short.               (required)
   topic    Groups tools within a subject. e.g. "Vocabulary".  (required)
   file     Path to the HTML file, relative to the site root.  (required)
   date     "YYYY-MM-DD" — when you added it. Used for sorting. (required)
   status   "done" to move it into the Done section (test finished). Omit for active. (optional)
   note     One short line describing what it drills.           (optional)

   FIELD REFERENCE (per subject)
   -----------------------------
   id       url-safe id for the subject; also used in tool file paths (required)
   name     Shown as the subject heading. e.g. "Math".          (required)
   blurb    One line under the subject name.                    (optional)
   accent   A hex color for this subject's spine/tab.           (optional)
   ============================================================================= */

window.STUDY_SITE = {
  // Shown in the header of the home page.
  siteTitle: "Study Buddy",
  siteTagline: "A home for the study tools we build through the year.",

  subjects: [
    // This site starts empty. Add subjects by copying a block like this one:
    // {
    //   id: "math",
    //   name: "Math",
    //   blurb: "Numbers, fractions, and problem solving.",
    //   accent: "#4c7a9a",
    //   tools: [
    //     { title: "Fractions Review", topic: "Fractions", file: "tools/math/fractions.html", date: "2026-10-01", note: "Adding, subtracting, and simplifying fractions." }
    //   ]
    // },
  ]
};
