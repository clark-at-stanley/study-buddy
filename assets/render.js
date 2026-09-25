/* Study Buddy — home page renderer.
   One interactive page: subject filter tiles on top, a flat list of all tools
   (newest first) below, each tool striped with its subject color. Clicking a
   tile filters to that subject; an "All" tile shows everything. No per-subject
   pages. Reads window.STUDY_SITE from tools.js. */

(function(){
  var SITE = window.STUDY_SITE || { siteTitle: "Study Buddy", subjects: [] };

  function esc(s){
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  // "2026-09-02" -> "Sep 2, 2026" (local, no timezone surprises)
  function prettyDate(iso){
    if(!iso) return "";
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if(!m) return esc(iso);
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return months[Number(m[2]) - 1] + " " + Number(m[3]) + ", " + m[1];
  }

  // Flatten all tools across subjects into one list, tagged with their subject.
  function allTools(){
    var list = [];
    (SITE.subjects || []).forEach(function(sub){
      (sub.tools || []).forEach(function(t){
        list.push({
          title: t.title, topic: t.topic, file: t.file, date: t.date, note: t.note,
          status: (t.status === "done") ? "done" : "active",
          subjectId: sub.id, subjectName: sub.name, accent: sub.accent || "#c9a227"
        });
      });
    });
    // newest first; tie-break by title
    list.sort(function(a,b){
      var d = (b.date || "").localeCompare(a.date || "");
      return d !== 0 ? d : (a.title || "").localeCompare(b.title || "");
    });
    return list;
  }

  var TOOLS = allTools();
  var activeSubject = "all";     // "all" or a subject id
  var statusFilter = "all";      // "all" or "active"

  function toolRowHtml(t){
    var note = t.note ? '<p class="tool-note">' + esc(t.note) + '</p>' : '';
    return '' +
      '<li class="tool-li" data-subject="' + esc(t.subjectId) + '">' +
        '<a class="tool' + (t.note ? ' has-note' : '') + '" href="' + esc(t.file) + '" style="--stripe:' + esc(t.accent) + '">' +
          '<span class="tool-top">' +
            '<span class="tool-head">' +
              '<span class="tool-title">' + esc(t.title) + '</span>' +
              '<span class="tool-dot">·</span>' +
              '<span class="tool-subject" style="color:' + esc(t.accent) + '">' + esc(t.subjectName) + '</span>' +
            '</span>' +
            '<span class="tool-date">' + prettyDate(t.date) + '</span>' +
          '</span>' +
          note +
        '</a>' +
      '</li>';
  }

  // Build the list HTML for the current filters.
  // - subject filter narrows by subject.
  // - statusFilter "active": flat list of active tools only.
  // - statusFilter "all": two sections, Active then Done.
  function listHtml(){
    function bySubject(t){ return activeSubject === "all" || t.subjectId === activeSubject; }
    var pool = TOOLS.filter(bySubject);

    if(statusFilter === "active"){
      var act = pool.filter(function(t){ return t.status === "active"; });
      if(!act.length) return '<p class="empty">No active tools here.</p>';
      return '<ul class="tool-list">' + act.map(toolRowHtml).join("") + '</ul>';
    }

    // "all" -> Active section, then Done section (only render a section if non-empty)
    var active = pool.filter(function(t){ return t.status === "active"; });
    var done = pool.filter(function(t){ return t.status === "done"; });
    var html = "";
    if(active.length){
      html += '<p class="list-section-label">Active</p>' +
              '<ul class="tool-list">' + active.map(toolRowHtml).join("") + '</ul>';
    }
    if(done.length){
      html += '<p class="list-section-label done">Done</p>' +
              '<ul class="tool-list done-list">' + done.map(toolRowHtml).join("") + '</ul>';
    }
    if(!html) html = '<p class="empty">No tools here.</p>';
    return html;
  }

  function applyFilter(){
    var listEl = document.getElementById("toolListArea");
    if(listEl) listEl.innerHTML = listHtml();
    // subject tile active state
    [].forEach.call(document.querySelectorAll(".subject-tile"), function(tile){
      var on = tile.getAttribute("data-id") === activeSubject;
      tile.classList.toggle("active", on);
      tile.setAttribute("aria-pressed", on ? "true" : "false");
    });
    // status switch labeled "Active only": on = show active tools only.
    var toggle = document.getElementById("statusToggle");
    if(toggle){
      var activeOnly = (statusFilter === "active");
      toggle.classList.toggle("on", activeOnly);
      toggle.setAttribute("aria-checked", activeOnly ? "true" : "false");
    }
  }

  function renderHome(){
    document.title = SITE.siteTitle || "Study Buddy";
    var host = document.getElementById("app");
    if(!host) return;

    var subjects = SITE.subjects || [];

    var head = '' +
      '<header class="masthead">' +
        '<h1>' + esc(SITE.siteTitle || "Study Buddy") + '</h1>' +
        '<button class="status-switch" id="statusToggle" type="button" role="switch" aria-label="Active only">' +
          '<span class="switch-label">Active only</span>' +
          '<span class="switch-track"><span class="switch-thumb"></span></span>' +
        '</button>' +
      '</header>';

    var tiles = '<button class="subject-tile active" data-id="all" aria-pressed="true">All</button>';
    subjects.forEach(function(sub){
      tiles += '<button class="subject-tile" data-id="' + esc(sub.id) + '" ' +
               'style="--tile-accent:' + esc(sub.accent || "#c9a227") + '">' +
               esc(sub.name) + '</button>';
    });
    var tileBar = '<div class="tile-bar" id="tileBar">' + tiles + '</div>';

    var list = TOOLS.length
      ? '<div id="toolListArea"></div>'
      : '<div class="empty">No tools yet. Add one in <code>tools.js</code>.</div>';

    var foot = '<p class="foot">Saved on this device as you study. Works offline once loaded.</p>';

    host.innerHTML = head + tileBar + list + foot;

    var bar = document.getElementById("tileBar");
    if(bar){
      [].forEach.call(bar.querySelectorAll(".subject-tile"), function(tile){
        tile.addEventListener("click", function(){
          var id = tile.getAttribute("data-id");
          activeSubject = (id === activeSubject && id !== "all") ? "all" : id;
          applyFilter();
        });
      });
    }
    var toggle = document.getElementById("statusToggle");
    if(toggle){
      toggle.addEventListener("click", function(){
        statusFilter = (statusFilter === "all") ? "active" : "all";
        applyFilter();
      });
    }
    applyFilter();
  }

  window.renderHome = renderHome;
})();
