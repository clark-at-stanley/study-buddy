/* Study tool engine — shared behavior for every tool.
   A tool calls StudyEngine.mount(config) with:
   {
     title, subtitle, accent, storageKey,       // identity
     modes: ["flash","write","mc"],             // subset, in display order
     sections: [ { id, name, cards:[ {q,a,orig?,changed?} ] } ]
   }
   The engine implements: mode/section pickers, all modes, missed-list summary,
   persistent history + miss patterns, corrected-answer highlighting, mobile.
   See STANDARD.md for the rules this enforces. */

window.StudyEngine = (function(){
  "use strict";

  function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function norm(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim(); }
  function shuffle(n){ var a=[]; for(var i=0;i<n;i++)a.push(i); for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i];a[i]=a[j];a[j]=t; } return a; }
  function shuffleArr(arr){ var a=arr.slice(); for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i];a[i]=a[j];a[j]=t; } return a; }
  function hasStore(){ try{ return typeof window!=="undefined" && !!window.localStorage; }catch(e){ return false; } }

  var MODE_LABELS = { flash:"Flashcards", write:"From scratch", mc:"Multiple choice", match:"Match", conj:"Random Pronoun", conjtable:"All Pronouns", build:"Some help" };
  var DEFAULT_PRONOUNS = ["yo","tú","él/ella","nosotros","vosotros","ellos/ellas"];

  function mount(cfg){
    // ---- Validate against the standard (fail loud in console, not silently) ----
    var hasTracks = !!(cfg && cfg.tracks && cfg.tracks.length);
    if(!cfg || (!hasTracks && (!cfg.sections || !cfg.sections.length))){ console.error("StudyEngine: no sections or tracks"); return; }
    var modes = (cfg.modes && cfg.modes.length) ? cfg.modes.slice() : ["flash"];
    var storageKey = cfg.storageKey || "tool";
    var accent = cfg.accent || "#c9a227";
    // strictMatch: exact string compare for write-in / conjugation (accents required).
    // When false (default), write-in uses the forgiving prose keyword heuristic.
    var strictMatch = !!cfg.strictMatch;
    // pronouns for conjugation mode (index-aligned with each card's `forms` array).
    var PRONOUNS = (cfg.pronouns && cfg.pronouns.length) ? cfg.pronouns.slice() : DEFAULT_PRONOUNS;

    // ---- Navigation model ----
    // Two-level (default): sections + modes.
    // Three-level (opt-in via cfg.tracks): Track -> Group -> Mode.
    //   cfg.tracks = [ { id, name, groups:[{id,name,cards}], modes:[...],
    //                    defaultModeFor?: fn(groupId)->modeId } ]
    var USE_TRACKS = !!(cfg.tracks && cfg.tracks.length);
    var TRACKS = USE_TRACKS ? cfg.tracks.slice() : null;

    // Two-level section choices (also used to hold the *current* track's groups).
    var SECTIONS, CHOICES, modesForMode;
    var trackId, groupId;

    if(USE_TRACKS){
      trackId = TRACKS[0].id;
      // groups/modes are resolved per current track (see refreshTrack)
    } else {
      SECTIONS = cfg.sections.slice();
      CHOICES = SECTIONS.slice();
      if(SECTIONS.length > 1){
        CHOICES.push({ id:"all", name:"Everything", cards: SECTIONS.reduce(function(a,s){ return a.concat(s.cards); }, []) });
      }
    }
    // Maps a card's q text back to its true home section, so studying via the
    // merged "Everything" view still records word-mastery stats against the
    // real section rather than a synthetic "all" bucket.
    var Q_TO_SECTION = {};
    if(!USE_TRACKS){ SECTIONS.forEach(function(s){ s.cards.forEach(function(c){ Q_TO_SECTION[c.q]=s.id; }); }); }

    // ---- State ----
    var sectionId = USE_TRACKS ? null : CHOICES[0].id;
    var mode = USE_TRACKS ? null : modes[0];
    var order=[], pos=0, reviewed=0, missed=[], answered=false, missedForms={};

    function curTrack(){ return TRACKS.filter(function(t){ return t.id===trackId; })[0] || TRACKS[0]; }
    function trackGroups(){ return curTrack().groups; }
    function trackModes(){ return curTrack().modes; }
    // Resolve current group/mode after a track (re)selection.
    function refreshTrack(keepGroup, keepMode){
      var gs=trackGroups(), ms=trackModes();
      if(!keepGroup || !gs.some(function(g){ return g.id===groupId; })) groupId = gs[0].id;
      // group-driven default mode (e.g. irregulars -> table)
      var wantMode = null;
      var t=curTrack();
      if(!keepMode && typeof t.defaultModeFor==="function"){ wantMode = t.defaultModeFor(groupId); }
      if(wantMode && ms.indexOf(wantMode)!==-1){ mode = wantMode; }
      else if(!keepMode || ms.indexOf(mode)===-1){ mode = ms[0]; }
    }

    // ---- Build shell ----
    document.title = cfg.title + " — Study Tool";
    var root = document.getElementById("app");
    root.innerHTML =
      '<a class="back-link" href="../../index.html">&lsaquo; Study Buddy</a>'+
      '<header class="masthead">'+
        (cfg.eyebrow ? '<p class="eyebrow">'+esc(cfg.eyebrow)+'</p>' : '')+
        '<h1>'+esc(cfg.title)+'</h1>'+
        (cfg.subtitle ? '<p class="sub">'+esc(cfg.subtitle)+'</p>' : '')+
      '</header>'+
      '<div class="card" id="controlsCard">'+
        '<div class="controls-head">'+
          '<p class="section-label" style="margin:0;">'+(USE_TRACKS?'Practice, group &amp; mode':(CHOICES.length>1?'Section &amp; mode':'Mode'))+'</p>'+
          '<div class="controls-head-actions">'+
            '<button class="link-btn" id="viewResultsBtn">View results</button>'+
            '<button class="link-btn" id="controlsToggle" style="display:none;">Change</button>'+
          '</div>'+
        '</div>'+
        '<div id="controlsBody">'+
          (USE_TRACKS ? '<p class="section-label controls-sub">Practice</p><div class="chip-row" id="trackRow"></div>' : '')+
          (USE_TRACKS ? '<p class="section-label controls-sub" id="groupHeading">Group</p><div class="chip-row" id="sectionRow"></div>'
                      : ((CHOICES.length>1) ? '<p class="section-label controls-sub">Section</p><div class="chip-row" id="sectionRow"></div>' : ''))+
          (USE_TRACKS ? '<p class="section-label controls-sub" id="modeHeading">Mode</p><div class="chip-row" id="modeRow"></div>'
                      : ((modes.length>1) ? '<p class="section-label controls-sub">Mode</p><div class="chip-row" id="modeRow"></div>' : ''))+
        '</div>'+
        '<p class="controls-summary hidden" id="controlsSummary"></p>'+
      '</div>'+
      '<div id="resultsSection" class="card hidden">'+
        '<div class="controls-head"><p class="section-label" style="margin:0;">Results &amp; miss patterns</p>'+
        '<button class="link-btn" id="closeResultsBtn">&larr; Back</button></div>'+
        '<div id="resultsBody"></div>'+
      '</div>'+
      '<div id="practiceSection" class="card hidden">'+
        '<div class="controls-head"><p class="section-label" style="margin:0;">Focused practice</p>'+
        '<button class="link-btn" id="closePracticeBtn">&larr; Back to results</button></div>'+
        '<div id="practiceBody"></div>'+
      '</div>'+
      '<div class="card" id="studyCard">'+
        '<div class="stats-row"><span id="statProgress"></span><span class="stats-row-actions"><span id="statBest" class="best-badge"></span><button type="button" class="link-btn hidden" id="stopRoundBtn">Stop round</button></span></div>'+
        '<div class="progress-track"><div class="progress-fill" id="progressFill"></div></div>'+
        '<div id="studyArea"></div>'+
      '</div>'+
      '<footer>Progress is saved on this device.</footer>';

    document.body.style.setProperty("--accent", accent);

    var elSectionRow = document.getElementById("sectionRow");
    var elModeRow = document.getElementById("modeRow");
    var elControlsBody = document.getElementById("controlsBody");
    var elControlsToggle = document.getElementById("controlsToggle");
    var elControlsSummary = document.getElementById("controlsSummary");
    var elStudyArea = document.getElementById("studyArea");
    var elStudyCard = document.getElementById("studyCard");
    var elStatProgress = document.getElementById("statProgress");
    var elStatBest = document.getElementById("statBest");
    var elStopRound = document.getElementById("stopRoundBtn");
    var elProgressFill = document.getElementById("progressFill");
    var elResults = document.getElementById("resultsSection");
    var elResultsBody = document.getElementById("resultsBody");
    var elViewResults = document.getElementById("viewResultsBtn");
    var elCloseResults = document.getElementById("closeResultsBtn");
    var elPractice = document.getElementById("practiceSection");
    var elPracticeBody = document.getElementById("practiceBody");
    var elClosePractice = document.getElementById("closePracticeBtn");

    var elTrackRow = document.getElementById("trackRow");
    var elGroupHeading = document.getElementById("groupHeading");
    var elModeHeading = document.getElementById("modeHeading");

    // ---- Chips ----
    function makeChip(row, id, label, onClick){
      var b=document.createElement("button"); b.className="chip"; b.textContent=label; b.dataset.id=String(id);
      b.onclick=onClick; row.appendChild(b); return b;
    }

    function rebuildTrackChips(){
      if(!USE_TRACKS) return;
      elSectionRow.innerHTML=""; elModeRow.innerHTML="";
      trackGroups().forEach(function(g){
        makeChip(elSectionRow, g.id, g.name, function(){ groupId=g.id; refreshTrack(true,false); renderChips(); startRun(); });
      });
      var ms=trackModes();
      if(elModeHeading) elModeHeading.style.display = ms.length>1 ? "" : "none";
      elModeRow.style.display = ms.length>1 ? "" : "none";
      ms.forEach(function(m){
        makeChip(elModeRow, m, MODE_LABELS[m]||m, function(){ mode=m; refreshTrack(true,true); renderChips(); startRun(); });
      });
    }

    if(USE_TRACKS){
      TRACKS.forEach(function(t){
        makeChip(elTrackRow, t.id, t.name, function(){ trackId=t.id; refreshTrack(false,false); rebuildTrackChips(); renderChips(); startRun(); });
      });
      refreshTrack(false,false);
      rebuildTrackChips();
    } else {
      if(CHOICES.length>1){
        CHOICES.forEach(function(s){ makeChip(elSectionRow, s.id, s.name, function(){ sectionId=s.id; startRun(); }); });
      }
      if(modes.length>1){
        modes.forEach(function(m){ makeChip(elModeRow, m, MODE_LABELS[m]||m, function(){ mode=m; startRun(); }); });
      }
    }

    function renderChips(){
      if(USE_TRACKS && elTrackRow) [].forEach.call(elTrackRow.children,function(c){ c.classList.toggle("active",c.dataset.id===String(trackId)); });
      if(elSectionRow) [].forEach.call(elSectionRow.children,function(c){ c.classList.toggle("active",c.dataset.id===String(USE_TRACKS?groupId:sectionId)); });
      if(elModeRow) [].forEach.call(elModeRow.children,function(c){ c.classList.toggle("active",c.dataset.id===String(mode)); });
    }

    function choice(){
      if(USE_TRACKS){ return trackGroups().filter(function(g){ return g.id===groupId; })[0] || trackGroups()[0]; }
      return CHOICES.filter(function(s){ return s.id===sectionId; })[0] || CHOICES[0];
    }
    function cards(){ return choice().cards; }
    function sectionLabel(id){
      if(USE_TRACKS){ var g=trackGroups().filter(function(x){ return x.id===id; })[0]; return g?g.name:id; }
      var s=CHOICES.filter(function(x){ return x.id===id; })[0]; return s?s.name:id;
    }
    function trackLabel(id){ var t=TRACKS.filter(function(x){ return x.id===id; })[0]; return t?t.name:id; }

    function collapse(){
      elControlsBody.classList.add("hidden"); elControlsSummary.classList.remove("hidden"); elControlsToggle.style.display="";
      var parts=[];
      if(USE_TRACKS){ parts.push(trackLabel(trackId)); parts.push(sectionLabel(groupId)); if(trackModes().length>1) parts.push(MODE_LABELS[mode]||mode); }
      else { if(CHOICES.length>1) parts.push(sectionLabel(sectionId)); if(modes.length>1) parts.push(MODE_LABELS[mode]||mode); }
      elControlsSummary.innerHTML = parts.map(function(p){ return '<span class="accent">'+esc(p)+'</span>'; }).join(" · ") || '<span class="accent">'+esc(MODE_LABELS[mode]||mode)+'</span>';
    }
    function expand(){ elControlsBody.classList.remove("hidden"); elControlsSummary.classList.add("hidden"); }
    elControlsToggle.onclick=function(){ if(elControlsBody.classList.contains("hidden")) expand(); else collapse(); };

    // ---- Storage: best + history ----
    function scopeId(){ return USE_TRACKS ? (trackId+":"+groupId) : sectionId; }
    function bestKey(){ return storageKey+":best:"+scopeId()+":"+mode; }
    function histKey(){ return storageKey+":history"; }
    async function loadBest(){ if(!hasStore())return null; try{ var v=window.localStorage.getItem(bestKey()); return v?Number(v):null; }catch(e){ return null; } }
    async function saveBest(v){ if(!hasStore())return; try{ var c=await loadBest(); if(c===null||v>c) window.localStorage.setItem(bestKey(),String(v)); }catch(e){} }
    async function loadHistory(){ if(!hasStore())return []; try{ var v=window.localStorage.getItem(histKey()); if(!v)return []; var p=JSON.parse(v); return Array.isArray(p)?p:[]; }catch(e){ return []; } }
    async function appendHistory(entry){ if(!hasStore())return; try{ var l=await loadHistory(); l.push(entry); while(l.length>300)l.shift(); window.localStorage.setItem(histKey(),JSON.stringify(l)); }catch(e){} }
    async function clearHistory(){ if(!hasStore())return; try{ window.localStorage.removeItem(histKey()); }catch(e){} }

    // ---- Partial-round saving: if he stops partway through, log what he got
    // through so far rather than losing it silently. Deliberately synchronous
    // (direct localStorage calls, no await) so it's safe to call from a
    // beforeunload handler, where async continuations aren't guaranteed to run.
    function saveInProgressRoundSync(){
      if(!hasStore()) return;
      if(!(reviewed>0 && order.length>0 && pos<order.length)) return;
      try{
        var total=cards().length;
        var score=reviewed-uniq(missed).length;
        var entry={
          t:Date.now(), section:scopeId(),
          sectionLabel:(USE_TRACKS?(trackLabel(trackId)+" \u00b7 "+sectionLabel(groupId)):sectionLabel(sectionId)),
          mode:mode, total:total, score:score,
          missed:uniq(missed).map(function(i){ return cards()[i].q; }),
          partial:true, attempted:reviewed
        };
        var raw=window.localStorage.getItem(histKey());
        var list=raw?JSON.parse(raw):[];
        if(!Array.isArray(list)) list=[];
        list.push(entry);
        while(list.length>300) list.shift();
        window.localStorage.setItem(histKey(), JSON.stringify(list));
      }catch(e){}
    }
    window.addEventListener("beforeunload", saveInProgressRoundSync);

    // ---- Word mastery: per (section-scope, question, mode) streaks ----
    // A word is "Solid" in a mode once the last MASTERY_STREAK attempts in that
    // mode came back correct in a row; any wrong attempt resets the streak to 0.
    // "Not tried yet" just means no attempts recorded there — never a red flag.
    var MASTERY_STREAK = 3;
    function wordStatsKey(){ return storageKey+":wordstats"; }
    var wordStatsCache = null; // loaded lazily, kept in memory for the rest of the session
    async function loadWordStats(){
      if(wordStatsCache) return wordStatsCache;
      if(!hasStore()){ wordStatsCache={}; return wordStatsCache; }
      try{ var v=window.localStorage.getItem(wordStatsKey()); wordStatsCache=v?JSON.parse(v):{}; }
      catch(e){ wordStatsCache={}; }
      return wordStatsCache;
    }
    async function saveWordStats(){ if(!hasStore())return; try{ window.localStorage.setItem(wordStatsKey(), JSON.stringify(wordStatsCache||{})); }catch(e){} }
    function statKey(scope,q,modeId){ return scope+"|@|"+q+"|@|"+modeId; }
    function scopeForCard(card){ return USE_TRACKS ? (trackId+":"+groupId) : (Q_TO_SECTION[card.q] || sectionId); }
    // Fire-and-forget: never block the UI on a storage round-trip for a single attempt.
    function recordAttempt(card, modeId, isCorrect){
      var scope=scopeForCard(card), q=card.q;
      loadWordStats().then(function(stats){
        var k=statKey(scope,q,modeId);
        var s=stats[k] || { streak:0, attempts:0, correct:0 };
        s.attempts++; if(isCorrect){ s.streak++; s.correct++; } else { s.streak=0; }
        stats[k]=s;
        saveWordStats();
      });
    }
    async function wordStatus(scope,q,modeId){
      var stats=await loadWordStats();
      var s=stats[statKey(scope,q,modeId)];
      if(!s || !s.attempts) return "new";
      return s.streak>=MASTERY_STREAK ? "solid" : "practice";
    }

    // ---- Lifecycle ----
    // startRun = prepare a fresh round and show the Start screen (controls expanded).
    // beginRound = collapse controls and show the first card (fired by the Start button).
    async function startRun(){
      saveInProgressRoundSync();
      renderChips();
      expand(); elControlsToggle.style.display="";
      order=shuffle(cards().length); pos=0; reviewed=0; missed=[]; missedForms={}; answered=false;
      elStatProgress.textContent=""; elProgressFill.style.width="0%";
      elStatBest.textContent="";
      var best=await loadBest();
      if(best!==null) elStatBest.textContent = ((mode==="mc"||mode==="match")?"Best: "+best+" / "+cards().length : "Best: "+best+" of "+cards().length+" known");
      renderStartScreen();
    }
    function renderStartScreen(){
      elStopRound.classList.add("hidden");
      var total=cards().length;
      var bits=[];
      if(USE_TRACKS){ bits.push(trackLabel(trackId)); bits.push(sectionLabel(groupId)); if(trackModes().length>1) bits.push(MODE_LABELS[mode]||mode); }
      else { if(CHOICES.length>1) bits.push(sectionLabel(sectionId)); if(modes.length>1) bits.push(MODE_LABELS[mode]||mode); }
      var line = bits.length ? bits.join(" · ") + " — " + total + (total===1?" card":" cards") + " ready." : total + (total===1?" card":" cards") + " ready.";
      elStudyArea.innerHTML =
        '<p class="sub" style="margin:0 0 4px;">'+esc(line)+'</p>'+
        '<div class="action-row"><button class="btn btn-primary" id="beginBtn">Start</button></div>';
      document.getElementById("beginBtn").onclick = function(){ collapse(); renderCurrent(); };
    }
    function updateProgress(){
      elStopRound.classList.remove("hidden");
      var total=cards().length;
      if(mode==="match"){
        var totalRounds=Math.max(1,Math.ceil(total/5));
        var curRound=Math.min(Math.floor(pos/5)+1,totalRounds);
        elStatProgress.textContent="Round "+curRound+" of "+totalRounds;
      } else {
        elStatProgress.textContent=(mode==="flash"?"Card ":"Question ")+Math.min(pos+1,total)+" of "+total;
      }
      elProgressFill.style.width=(reviewed/total*100)+"%";
    }
    function renderCurrent(){
      if(pos>=order.length) return renderSummary();
      updateProgress(); answered=false;
      if(mode==="match"){ renderMatch(); return; }
      var card=cards()[order[pos]];
      if(mode==="flash") renderFlash(card);
      else if(mode==="mc") renderMC(card);
      else if(mode==="conj") renderConj(card);
      else if(mode==="conjtable") renderConjTable(card);
      else if(mode==="build") renderBuild(card);
      else renderWrite(card);
    }

    function changedNote(card){
      if(!card.changed || !card.orig) return "";
      return '<div class="changed-note"><p class="cn-tag">Changed from your original</p>'+
             '<p class="cn-orig">You wrote: &ldquo;'+esc(card.orig)+'&rdquo;</p></div>';
    }

    // ---- Flashcards ----
    function renderFlash(card){
      var badge=card.changed?'<span class="changed-badge">corrected</span>':'';
      var note=changedNote(card);
      elStudyArea.innerHTML=
        '<div class="flashcard"><div class="flash-inner" id="flashInner">'+
          '<div class="flash-face flash-front"><p class="flash-tag">Question</p><div class="flash-q">'+esc(card.q)+'</div></div>'+
          '<div class="flash-face flash-back"><p class="flash-tag">Answer'+badge+'</p><div class="flash-a">'+esc(card.a)+'</div></div>'+
        '</div></div>'+
        '<p class="flash-hint">Tap the card to flip</p>'+
        (note?'<div id="flashNote" class="hidden">'+note+'</div>':'')+
        '<div class="action-row">'+
          '<button class="btn btn-ghost" id="againBtn">Study again later</button>'+
          '<button class="btn btn-primary" id="gotBtn">Got it &rsaquo;</button>'+
        '</div>';
      var inner=document.getElementById("flashInner");
      var noteEl=document.getElementById("flashNote");
      function sizeCard(){
        var faces=inner.querySelectorAll(".flash-face:not(.flash-measure)"); var tallest=0;
        for(var i=0;i<faces.length;i++){
          var probe=document.createElement("div"); probe.className="flash-face flash-measure";
          probe.style.position="relative"; probe.style.display="block"; probe.innerHTML=faces[i].innerHTML;
          inner.appendChild(probe); tallest=Math.max(tallest,probe.scrollHeight); inner.removeChild(probe);
        }
        inner.style.height=Math.max(160,tallest)+"px";
      }
      sizeCard(); setTimeout(sizeCard,60);
      if(!mount._resizeHooked){
        window.addEventListener("resize",function(){
          var el=document.getElementById("flashInner"); if(!el)return;
          var faces=el.querySelectorAll(".flash-face:not(.flash-measure)"); var t=0;
          for(var i=0;i<faces.length;i++){ var p=document.createElement("div"); p.className="flash-face flash-measure"; p.style.position="relative"; p.style.display="block"; p.innerHTML=faces[i].innerHTML; el.appendChild(p); t=Math.max(t,p.scrollHeight); el.removeChild(p); }
          el.style.height=Math.max(160,t)+"px";
        });
        mount._resizeHooked=true;
      }
      inner.onclick=function(){ inner.classList.toggle("flipped"); if(noteEl) noteEl.classList.toggle("hidden",!inner.classList.contains("flipped")); };
      document.getElementById("gotBtn").onclick=function(){ recordAttempt(card,mode,true); reviewed++; pos++; renderCurrent(); };
      document.getElementById("againBtn").onclick=function(){ recordAttempt(card,mode,false); missed.push(order[pos]); reviewed++; pos++; renderCurrent(); };
    }

    // ---- Multiple choice ----
    function renderMC(card){
      var all=cards(); var pool=[];
      for(var i=0;i<all.length;i++){ if(all[i]!==card && all[i].a!==card.a) pool.push(all[i].a); }
      pool=shuffleArr(pool).slice(0,3);
      var options=shuffleArr([card.a].concat(pool));
      var badge=card.changed?'<span class="changed-badge">corrected</span>':'';
      var html='<p class="prompt-eyebrow">Choose the best answer</p><p class="prompt">'+esc(card.q)+'</p><div class="options" id="opts">';
      options.forEach(function(opt,idx){ html+='<button class="option-btn" data-opt="'+idx+'">'+esc(opt)+'</button>'; });
      html+='</div><div class="feedback" id="fb"></div>'+
        '<div id="mcNote"></div>'+
        '<div class="action-row"><button class="btn btn-primary" id="nextBtn" disabled>Next &rsaquo;</button></div>';
      elStudyArea.innerHTML=html;
      var opts=document.getElementById("opts");
      [].forEach.call(opts.children,function(btn){
        btn.onclick=function(){
          if(answered)return; answered=true;
          var chosen=options[Number(btn.dataset.opt)]; var correct=(chosen===card.a);
          recordAttempt(card,mode,correct);
          [].forEach.call(opts.children,function(b){ b.disabled=true; if(options[Number(b.dataset.opt)]===card.a) b.classList.add("correct"); });
          if(!correct){ btn.classList.add("incorrect"); missed.push(order[pos]); }
          var fb=document.getElementById("fb"); fb.className="feedback show "+(correct?"good":"bad");
          fb.innerHTML=(correct?"Correct!":"Not quite — the highlighted answer is right.")+(badge&&!correct?" "+badge:"");
          if(card.changed) document.getElementById("mcNote").innerHTML=changedNote(card);
          document.getElementById("nextBtn").disabled=false; reviewed++; updateProgress();
        };
      });
      document.getElementById("nextBtn").onclick=function(){ pos++; renderCurrent(); };
    }

    // ---- Matching: N English prompts (targets) vs their answers + decoys ----
    // Each round pulls the next 5 (unused) cards from the shuffled order as
    // targets, plus up to 5 more cards from the whole pool as decoys, so the
    // right-hand list is bigger than the left and he has to actually
    // discriminate between similar words — not just recognize one option.
    function renderMatch(){
      var all=cards();
      var batchSize=Math.min(5, order.length-pos);
      var targetIdxs=order.slice(pos, pos+batchSize);
      var otherIdxs=[];
      for(var i=0;i<all.length;i++){ if(targetIdxs.indexOf(i)===-1) otherIdxs.push(i); }
      var decoyCount=Math.min(5, otherIdxs.length);
      var decoyIdxs=shuffleArr(otherIdxs).slice(0, decoyCount);

      var leftItems=targetIdxs.map(function(ci){ return { ci:ci, q:all[ci].q }; });
      var rightItems=shuffleArr(targetIdxs.concat(decoyIdxs)).map(function(ci){ return { ci:ci, a:all[ci].a }; });

      elStudyArea.innerHTML=
        '<p class="prompt-eyebrow">Match each English word to its Spanish translation</p>'+
        '<div class="match-grid">'+
          '<div class="match-col" id="matchLeft">'+
            leftItems.map(function(it){ return '<button type="button" class="match-item" data-ci="'+it.ci+'">'+esc(it.q)+'</button>'; }).join("")+
          '</div>'+
          '<div class="match-col" id="matchRight">'+
            rightItems.map(function(it){ return '<button type="button" class="match-item" data-ci="'+it.ci+'">'+esc(it.a)+'</button>'; }).join("")+
          '</div>'+
        '</div>'+
        '<p class="feedback" id="matchFb"></p>';

      var leftBtns=elStudyArea.querySelectorAll("#matchLeft .match-item");
      var rightBtns=elStudyArea.querySelectorAll("#matchRight .match-item");
      var fb=document.getElementById("matchFb");
      var missedOnce={}, selectedEl=null, selectedCi=null, doneCount=0;

      function clearSelection(){ if(selectedEl) selectedEl.classList.remove("selected"); selectedEl=null; selectedCi=null; }

      [].forEach.call(leftBtns, function(btn){
        btn.onclick=function(){
          if(btn.classList.contains("matched")) return;
          clearSelection();
          btn.classList.add("selected"); selectedEl=btn; selectedCi=Number(btn.dataset.ci);
        };
      });

      [].forEach.call(rightBtns, function(btn){
        btn.onclick=function(){
          if(btn.classList.contains("matched") || selectedCi===null) return;
          var rightCi=Number(btn.dataset.ci);
          if(rightCi===selectedCi){
            var matchedCard=all[selectedCi];
            selectedEl.classList.remove("selected"); selectedEl.classList.add("matched");
            btn.classList.add("matched");
            clearSelection(); doneCount++; reviewed++;
            recordAttempt(matchedCard,mode,true);
            fb.className="feedback show good"; fb.textContent="Correct!";
            updateProgress();
            if(doneCount>=leftItems.length){
              fb.textContent="Round complete!";
              setTimeout(function(){ pos+=leftItems.length; renderCurrent(); }, 550);
            }
          } else {
            var missedCard=all[selectedCi];
            if(!missedOnce[selectedCi]){ missed.push(selectedCi); missedOnce[selectedCi]=true; }
            recordAttempt(missedCard,mode,false);
            var wrongLeft=selectedEl, wrongRight=btn;
            wrongLeft.classList.add("wrong"); wrongRight.classList.add("wrong");
            fb.className="feedback show bad"; fb.textContent="Not quite \u2014 try again.";
            clearSelection();
            setTimeout(function(){ wrongLeft.classList.remove("wrong"); wrongRight.classList.remove("wrong"); }, 500);
          }
        };
      });
    }

    // ---- Write-in (auto-grade + accept/override) ----
    // Strict tools (strictMatch) require an exact match incl. accents; loose
    // tools use the forgiving prose keyword heuristic.
    function strictEqual(a,b){ return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }
    var ACCENT_KEYS = ["á","é","í","ó","ú","ñ","ü"];
    function accentRow(targetId){
      return '<div class="accent-row" data-target="'+targetId+'">'+
        ACCENT_KEYS.map(function(c){ return '<button type="button" class="accent-key" data-char="'+c+'">'+c+'</button>'; }).join("")+
        '</div>';
    }
    function wireAccents(scope, box){
      var row = scope.querySelector(".accent-row"); if(!row) return;
      row.querySelectorAll(".accent-key").forEach(function(btn){
        btn.addEventListener("mousedown", function(e){ e.preventDefault(); });
        btn.onclick=function(){
          if(box.disabled) return;
          var s=box.selectionStart==null?box.value.length:box.selectionStart;
          var e=box.selectionEnd==null?box.value.length:box.selectionEnd;
          box.value=box.value.slice(0,s)+btn.dataset.char+box.value.slice(e);
          box.focus(); try{ box.setSelectionRange(s+1,s+1); }catch(_){}
        };
      });
    }

    function renderWrite(card){
      var accents = strictMatch ? accentRow("writeBox") : "";
      elStudyArea.innerHTML=
        '<p class="prompt-eyebrow">Write your answer, then check it</p><p class="prompt">'+esc(card.q)+'</p>'+
        '<textarea class="write-area" id="writeBox" rows="'+(strictMatch?1:3)+'" placeholder="Type your answer..."></textarea>'+
        accents+
        '<div class="action-row"><button class="btn btn-primary" id="checkBtn">Check answer</button></div>'+
        '<div id="revealArea"></div>';
      var box=document.getElementById("writeBox"); box.focus();
      if(strictMatch) wireAccents(elStudyArea, box);
      document.getElementById("checkBtn").onclick=function(){
        if(answered)return; answered=true; box.disabled=true; document.getElementById("checkBtn").disabled=true;
        var blank=!box.value.trim();
        var badge=card.changed?'<span class="changed-badge">corrected</span>':'';
        var autoCorrect, subLine;
        if(strictMatch){
          autoCorrect = !blank && strictEqual(box.value, card.a);
          subLine = blank ? "Nothing was typed." : (autoCorrect ? "Exact match." : "That doesn\u2019t match — check spelling and accents.");
        } else {
          var typed=norm(box.value);
          var aw=norm(card.a).split(" ").filter(function(w){ return w.length>4; });
          var uw=aw.filter(function(w,i){ return aw.indexOf(w)===i; });
          var hit=uw.filter(function(w){ return typed.indexOf(w)!==-1; }).length;
          var pct=uw.length?Math.round(hit/uw.length*100):0;
          autoCorrect=!blank && pct>=55;
          subLine = blank ? "Nothing was typed." : ("Your answer matched about "+pct+"% of the key terms.");
        }
        function renderVerdict(isCorrect){
          var banner='<div class="verdict '+(isCorrect?"correct":"wrong")+'">'+
            '<p class="v-line">'+(isCorrect?"Marked correct":"Marked as missed")+'</p>'+
            '<p class="v-sub">'+subLine+' You can change this below.</p></div>';
          var actions='<div class="verdict-actions"><p class="lead">'+(isCorrect?"Not right after all?":"Actually got it?")+'</p>'+
            '<div class="action-row">'+
              (isCorrect?'<button class="btn btn-ghost" id="flipBtn">Change to missed</button>':'<button class="btn btn-ghost" id="flipBtn">Change to correct</button>')+
              '<button class="btn btn-primary" id="acceptBtn">Accept &amp; continue &rsaquo;</button>'+
            '</div></div>';
          document.getElementById("verdictWrap").innerHTML=banner+actions;
          document.getElementById("flipBtn").onclick=function(){ renderVerdict(!isCorrect); };
          document.getElementById("acceptBtn").onclick=function(){ recordAttempt(card,mode,isCorrect); if(!isCorrect) missed.push(order[pos]); reviewed++; pos++; renderCurrent(); };
        }
        document.getElementById("revealArea").innerHTML=
          '<div class="model-answer"><p class="ma-tag">Answer'+badge+'</p><p>'+esc(card.a)+'</p></div>'+
          changedNote(card)+'<div id="verdictWrap"></div>';
        renderVerdict(autoCorrect);
      };
    }

    // ---- Conjugation (Spanish): show English + a random pronoun, type the form ----
    function renderConj(card){
      var forms = card.forms || [];
      if(!forms.length){ // safety: card without forms
        elStudyArea.innerHTML='<p class="sub">This card has no conjugation data.</p>'+
          '<div class="action-row"><button class="btn btn-primary" id="skipBtn">Next &rsaquo;</button></div>';
        document.getElementById("skipBtn").onclick=function(){ reviewed++; pos++; renderCurrent(); };
        return;
      }
      var pi = Math.floor(Math.random()*Math.min(PRONOUNS.length, forms.length));
      var pronoun = PRONOUNS[pi];
      var answer = forms[pi];
      var badge=card.changed?'<span class="changed-badge">corrected</span>':'';
      var stemNote = card.stemType ? ' <span style="color:var(--ink-dim);font-weight:400;">('+esc(card.stemType)+')</span>' : '';
      elStudyArea.innerHTML=
        '<p class="prompt-eyebrow">Conjugate — present tense</p>'+
        '<p class="prompt">'+esc(card.q)+stemNote+'<br><span style="color:var(--accent);font-weight:600;">'+esc(pronoun)+'</span></p>'+
        '<textarea class="write-area" id="writeBox" rows="1" placeholder="Type the conjugated verb..."></textarea>'+
        accentRow("writeBox")+
        '<div class="action-row"><button class="btn btn-primary" id="checkBtn">Check answer</button></div>'+
        '<div id="revealArea"></div>';
      var box=document.getElementById("writeBox"); box.focus();
      wireAccents(elStudyArea, box);
      document.getElementById("checkBtn").onclick=function(){
        if(answered)return; answered=true; box.disabled=true; document.getElementById("checkBtn").disabled=true;
        var blank=!box.value.trim();
        var isRight=!blank && strictEqual(box.value, answer);
        var sub = blank?"Nothing was typed.":(isRight?"Exact match.":"That doesn\u2019t match — check spelling and accents.");
        function renderVerdict(isCorrect){
          var banner='<div class="verdict '+(isCorrect?"correct":"wrong")+'">'+
            '<p class="v-line">'+(isCorrect?"Marked correct":"Marked as missed")+'</p>'+
            '<p class="v-sub">'+sub+' You can change this below.</p></div>';
          var actions='<div class="verdict-actions"><p class="lead">'+(isCorrect?"Not right after all?":"Actually got it?")+'</p>'+
            '<div class="action-row">'+
              (isCorrect?'<button class="btn btn-ghost" id="flipBtn">Change to missed</button>':'<button class="btn btn-ghost" id="flipBtn">Change to correct</button>')+
              '<button class="btn btn-primary" id="acceptBtn">Accept &amp; continue &rsaquo;</button>'+
            '</div></div>';
          document.getElementById("verdictWrap").innerHTML=banner+actions;
          document.getElementById("flipBtn").onclick=function(){ renderVerdict(!isCorrect); };
          document.getElementById("acceptBtn").onclick=function(){ recordAttempt(card,mode,isCorrect); if(!isCorrect) missed.push(order[pos]); reviewed++; pos++; renderCurrent(); };
        }
        document.getElementById("revealArea").innerHTML=
          '<div class="model-answer"><p class="ma-tag">Answer'+badge+'</p><p>'+esc(pronoun)+' '+esc(answer)+'</p></div>'+
          changedNote(card)+'<div id="verdictWrap"></div>';
        renderVerdict(isRight);
      };
    }

    // ---- Conjugation TABLE: fill in all pronouns; grade each ----
    function renderConjTable(card){
      var forms = card.forms || [];
      if(!forms.length){
        elStudyArea.innerHTML='<p class="sub">This card has no conjugation data.</p>'+
          '<div class="action-row"><button class="btn btn-primary" id="skipBtn">Next &rsaquo;</button></div>';
        document.getElementById("skipBtn").onclick=function(){ reviewed++; pos++; renderCurrent(); };
        return;
      }
      var n = Math.min(PRONOUNS.length, forms.length);
      var badge=card.changed?'<span class="changed-badge">corrected</span>':'';
      var stemNote = card.stemType ? ' <span style="color:var(--ink-dim);font-weight:400;">('+esc(card.stemType)+')</span>' : '';
      var rows='';
      for(var i=0;i<n;i++){
        rows+='<div class="conj-row">'+
          '<label class="conj-pron">'+esc(PRONOUNS[i])+'</label>'+
          '<input class="conj-input" id="ct'+i+'" type="text" autocomplete="off" autocapitalize="off" spellcheck="false">'+
        '</div>';
      }
      elStudyArea.innerHTML=
        '<p class="prompt-eyebrow">Conjugate all forms — present tense</p>'+
        '<p class="prompt">'+esc(card.q)+stemNote+'</p>'+
        '<div class="conj-table" id="conjTable">'+rows+'</div>'+
        accentRow("ct0")+
        '<div class="action-row"><button class="btn btn-primary" id="checkBtn">Check answers</button></div>'+
        '<div id="revealArea"></div>';
      // Accent keys target the last-focused conj input.
      var lastBox=document.getElementById("ct0");
      for(var j=0;j<n;j++){ (function(el){ el.addEventListener("focus",function(){ lastBox=el; }); })(document.getElementById("ct"+j)); }
      var arow=elStudyArea.querySelector(".accent-row");
      if(arow){ arow.querySelectorAll(".accent-key").forEach(function(btn){
        btn.addEventListener("mousedown",function(e){ e.preventDefault(); });
        btn.onclick=function(){ var b=lastBox; if(!b||b.disabled)return; var s=b.selectionStart==null?b.value.length:b.selectionStart,e=b.selectionEnd==null?b.value.length:b.selectionEnd; b.value=b.value.slice(0,s)+btn.dataset.char+b.value.slice(e); b.focus(); try{ b.setSelectionRange(s+1,s+1); }catch(_){}}; }); }
      document.getElementById("ct0").focus();

      document.getElementById("checkBtn").onclick=function(){
        if(answered)return; answered=true;
        var wrongForms=[]; var anyWrong=false;
        for(var i=0;i<n;i++){
          var el=document.getElementById("ct"+i); el.disabled=true;
          var ok = strictEqual(el.value, forms[i]);
          el.classList.add(ok?"conj-ok":"conj-bad");
          if(!ok){ anyWrong=true; wrongForms.push(PRONOUNS[i]); }
        }
        document.getElementById("checkBtn").disabled=true;
        var correctByDefault=!anyWrong;
        // Build the answer key + which were wrong.
        var keyRows='';
        for(var k=0;k<n;k++){ keyRows+='<div class="conj-key-row"><span class="conj-pron">'+esc(PRONOUNS[k])+'</span><span>'+esc(forms[k])+'</span></div>'; }
        function renderVerdict(isCorrect){
          var sub = isCorrect ? "All forms correct." : (wrongForms.length+" of "+n+" forms were off: "+wrongForms.join(", ")+".");
          var banner='<div class="verdict '+(isCorrect?"correct":"wrong")+'">'+
            '<p class="v-line">'+(isCorrect?"Marked correct":"Marked as missed")+'</p>'+
            '<p class="v-sub">'+esc(sub)+' You can change this below.</p></div>';
          var actions='<div class="verdict-actions"><p class="lead">'+(isCorrect?"Not right after all?":"Actually got it?")+'</p>'+
            '<div class="action-row">'+
              (isCorrect?'<button class="btn btn-ghost" id="flipBtn">Change to missed</button>':'<button class="btn btn-ghost" id="flipBtn">Change to correct</button>')+
              '<button class="btn btn-primary" id="acceptBtn">Accept &amp; continue &rsaquo;</button>'+
            '</div></div>';
          document.getElementById("verdictWrap").innerHTML=banner+actions;
          document.getElementById("flipBtn").onclick=function(){ renderVerdict(!isCorrect); };
          document.getElementById("acceptBtn").onclick=function(){
            recordAttempt(card,mode,isCorrect);
            if(!isCorrect){ missed.push(order[pos]); missedForms[order[pos]]=(missedForms[order[pos]]||[]).concat(wrongForms); }
            reviewed++; pos++; renderCurrent();
          };
        }
        document.getElementById("revealArea").innerHTML=
          '<div class="model-answer"><p class="ma-tag">Answer key'+badge+'</p><div class="conj-key">'+keyRows+'</div></div>'+
          changedNote(card)+'<div id="verdictWrap"></div>';
        renderVerdict(correctByDefault);
      };
    }

    function renderBuild(card){
      var answer = card.a || "";
      var chars = answer.split("");                       // includes spaces
      var letterIdx = [];                                 // indices in `chars` that are letters (not spaces)
      chars.forEach(function(ch,i){ if(ch !== " ") letterIdx.push(i); });
      var needed = letterIdx.length;

      // Tiles: one per letter, shuffled. Each tile knows its character.
      var tiles = letterIdx.map(function(i,k){ return { id:k, ch:chars[i] }; });
      var bankOrder = shuffle(tiles.length); // display order of tiles in the bank
      var placed = [];                        // tile ids placed, in order
      var badge = card.changed ? '<span class="changed-badge">corrected</span>' : '';

      elStudyArea.innerHTML =
        '<p class="prompt-eyebrow">Build the Spanish — tap the letters in order</p>'+
        '<p class="prompt">'+esc(card.q)+'</p>'+
        '<div class="build-zone" id="buildZone"></div>'+
        '<div class="bank" id="bank"></div>'+
        '<div class="action-row">'+
          '<button class="btn btn-ghost" id="undoBtn">Undo</button>'+
          '<button class="btn btn-ghost" id="clearBtn">Clear</button>'+
          '<button class="btn btn-ghost" id="revealBtn">Show answer</button>'+
        '</div>'+
        '<p class="build-hint" id="buildHint"></p>'+
        '<div id="revealArea"></div>';

      var zone = document.getElementById("buildZone");
      var bank = document.getElementById("bank");

      function currentString(){
        // Reconstruct with spaces auto-filled at the right positions.
        var out = "", li = 0;
        for(var i=0;i<chars.length;i++){
          if(chars[i]===" "){ out += " "; }
          else { out += (li < placed.length ? tiles[placed[li]].ch : ""); li++; }
        }
        return out;
      }

      function drawBank(){
        bank.innerHTML = bankOrder.map(function(tid){
          var used = placed.indexOf(tid) !== -1;
          return '<button class="bank-tile'+(used?' used':'')+'" data-tid="'+tid+'">'+esc(tiles[tid].ch)+'</button>';
        }).join("");
        bank.querySelectorAll(".bank-tile").forEach(function(btn){
          btn.onclick = function(){
            if(answered) return;
            var tid = Number(btn.dataset.tid);
            if(placed.indexOf(tid) !== -1) return;
            placed.push(tid);
            drawZone(); drawBank();
            if(placed.length === needed) autoCheck();
          };
        });
      }

      function drawZone(){
        zone.className = "build-zone";
        var html = "", li = 0;
        for(var i=0;i<chars.length;i++){
          if(chars[i]===" "){
            html += '<span class="build-slot space"></span>';
          } else {
            if(li < placed.length){
              html += '<span class="build-slot" data-pos="'+li+'">'+esc(tiles[placed[li]].ch)+'</span>';
            } else {
              html += '<span class="build-slot empty"></span>';
            }
            li++;
          }
        }
        zone.innerHTML = html;
        zone.querySelectorAll(".build-slot[data-pos]").forEach(function(sl){
          sl.onclick = function(){
            if(answered) return;
            var pos = Number(sl.dataset.pos);
            placed.splice(pos, 1);   // remove that letter, shift the rest back
            drawZone(); drawBank();
          };
        });
      }

      function finish(isCorrectDefault){
        answered = true;
        var badge2 = card.changed ? '<span class="changed-badge">corrected</span>' : '';
        function renderVerdict(isCorrect){
          zone.className = "build-zone " + (isCorrect ? "correct" : "wrong");
          var banner='<div class="verdict '+(isCorrect?"correct":"wrong")+'">'+
            '<p class="v-line">'+(isCorrect?"Correct!":"Not quite")+'</p>'+
            '<p class="v-sub">You can change this below.</p></div>';
          var actions='<div class="verdict-actions"><p class="lead">'+(isCorrect?"Not right after all?":"Actually got it?")+'</p>'+
            '<div class="action-row">'+
              (isCorrect?'<button class="btn btn-ghost" id="flipBtn">Change to missed</button>':'<button class="btn btn-ghost" id="flipBtn">Change to correct</button>')+
              '<button class="btn btn-primary" id="acceptBtn">Accept &amp; continue &rsaquo;</button>'+
            '</div></div>';
          document.getElementById("revealArea").innerHTML =
            '<div class="model-answer"><p class="ma-tag">Answer'+badge2+'</p><p>'+esc(answer)+'</p></div>'+
            changedNote(card)+'<div id="verdictWrap2">'+banner+actions+'</div>';
          document.getElementById("flipBtn").onclick=function(){ renderVerdict(!isCorrect); };
          document.getElementById("acceptBtn").onclick=function(){ recordAttempt(card,mode,isCorrect); if(!isCorrect) missed.push(order[pos]); reviewed++; pos++; renderCurrent(); };
        }
        renderVerdict(isCorrectDefault);
      }

      function autoCheck(){
        var ok = currentString().trim().toLowerCase() === answer.trim().toLowerCase();
        finish(ok);
      }

      document.getElementById("undoBtn").onclick = function(){ if(answered||!placed.length) return; placed.pop(); zone.className="build-zone"; drawZone(); drawBank(); };
      document.getElementById("clearBtn").onclick = function(){ if(answered) return; placed=[]; zone.className="build-zone"; drawZone(); drawBank(); };
      document.getElementById("revealBtn").onclick = function(){ if(answered) return; finish(false); };

      drawZone(); drawBank();
    }

    async function renderSummary(){
      elStopRound.classList.add("hidden");
      elProgressFill.style.width="100%"; elStatProgress.textContent="Done";
      var total=cards().length; var score=total-uniq(missed).length;
      await saveBest(score);
      await appendHistory({ t:Date.now(), section:scopeId(), sectionLabel:(USE_TRACKS?(trackLabel(trackId)+" · "+sectionLabel(groupId)):sectionLabel(sectionId)), mode:mode, total:total, score:score, missed:uniq(missed).map(function(i){ return cards()[i].q; }) });
      var best=await loadBest();
      elStatBest.textContent=((mode==="mc"||mode==="match")?"Best: "+best+" / "+total:"Best: "+best+" of "+total+" known");

      var reviewHtml, um=uniq(missed);
      if(um.length){
        var rows=um.map(function(i){
          var c=cards()[i];
          var b=c.changed?'<span class="rc">corrected</span>':'';
          var wf = (mode==="conjtable" && missedForms[i] && missedForms[i].length)
            ? '<span class="ra">missed: '+esc(uniqStr(missedForms[i]).join(", "))+'</span>'
            : '<span class="ra">'+esc(c.a)+'</span>';
          return '<li><span class="rq">'+esc(c.q)+'</span>'+b+wf+'</li>';
        }).join("");
        reviewHtml='<div class="review-block"><p class="review-title">Review these ('+um.length+'):</p><ul class="review-list">'+rows+'</ul></div>';
      } else {
        reviewHtml='<p class="review-perfect">Perfect — you knew them all! 🎉</p>';
      }
      elStudyArea.innerHTML=
        '<div class="summary"><p class="big">'+((mode==="mc"||mode==="match")?(score+" / "+total):"Nice work!")+'</p>'+
        '<p>'+((mode==="mc"||mode==="match")?"correct":(score+" of "+total+" known"))+'</p>'+reviewHtml+
        '<div class="action-row" style="justify-content:center"><button class="btn btn-primary" id="restartBtn">Go again</button></div></div>';
      document.getElementById("restartBtn").onclick=startRun;
    }
    function uniq(arr){ var s={},o=[]; arr.forEach(function(i){ if(!s[i]){ s[i]=1; o.push(i); } }); return o; }
    function uniqStr(arr){ var s={},o=[]; (arr||[]).forEach(function(x){ if(!s[x]){ s[x]=1; o.push(x); } }); return o; }

    // ---- Results / patterns screen ----
    // ---- Word mastery table: one grid per section/group, rows=words, cols=modes this tool offers ----
    var practiceCandidates = []; // built fresh each time the mastery table renders: [{scope,q,card}]
    var practiceSelected = [];   // indices into practiceCandidates currently checked, max 5

    async function buildMasteryTable(){
      var stats=await loadWordStats();
      practiceCandidates = [];
      practiceSelected = [];
      var scopes=[];
      if(USE_TRACKS){
        TRACKS.forEach(function(t){
          t.groups.forEach(function(g){ scopes.push({ id:t.id+":"+g.id, label:t.name+" \u00b7 "+g.name, cards:g.cards, modes:t.modes }); });
        });
      } else {
        SECTIONS.forEach(function(s){ scopes.push({ id:s.id, label:s.name, cards:s.cards, modes:modes }); });
      }
      var html="";
      scopes.forEach(function(scope){
        var anyData=scope.cards.some(function(c){ return scope.modes.some(function(m){ return !!stats[statKey(scope.id,c.q,m)]; }); });
        if(!anyData) return;
        html+='<p class="rp-title">'+esc(scope.label)+' \u2014 word mastery</p>';
        html+='<div class="mastery-table" style="grid-template-columns:auto minmax(110px,1.5fr) repeat('+scope.modes.length+',1fr);">';
        html+='<div class="mastery-row mastery-head"><div class="mastery-cell"></div><div class="mastery-word"></div>'+
          scope.modes.map(function(m){ return '<div class="mastery-cell">'+esc(MODE_LABELS[m]||m)+'</div>'; }).join("")+
          '</div>';
        scope.cards.forEach(function(c){
          var idx = practiceCandidates.length;
          practiceCandidates.push({ scope:scope.id, q:c.q, card:c });
          html+='<div class="mastery-row"><div class="mastery-cell"><input type="checkbox" class="practice-check" data-idx="'+idx+'"></div><div class="mastery-word">'+esc(c.q)+'</div>'+
            scope.modes.map(function(m){
              var s=stats[statKey(scope.id,c.q,m)];
              var status=(!s||!s.attempts)?"new":(s.streak>=MASTERY_STREAK?"solid":"practice");
              var inner=(status==="new")?'<span class="mastery-dash">\u2014</span>'
                :'<span class="mastery-pill mastery-'+status+'">'+(status==="solid"?"Solid":"Needs practice")+'</span>';
              return '<div class="mastery-cell">'+inner+'</div>';
            }).join("")+
            '</div>';
        });
        html+='</div>';
      });
      return html;
    }

    async function openResults(){
      elControlsBody.classList.add("hidden"); elControlsSummary.classList.add("hidden");
      elControlsToggle.style.display="none"; elViewResults.style.display="none";
      elStudyCard.classList.add("hidden"); elResults.classList.remove("hidden");
      elResultsBody.innerHTML='<p class="results-empty">Loading…</p>';
      var history=await loadHistory();
      if(!history.length){ elResultsBody.innerHTML='<p class="results-empty">No completed rounds yet. Finish a round and your results — including which questions you missed — will show up here.</p>'; return; }

      var masteryHtml=await buildMasteryTable();
      var groups={};
      history.forEach(function(h){ var k=h.section+"|@|"+h.mode; (groups[k]=groups[k]||[]).push(h); });
      var practiceBar = masteryHtml ? (
        '<div class="practice-bar" id="practiceBar">'+
          '<span id="practiceCount">0 of 5 words selected for focused practice</span>'+
          '<button class="btn btn-primary" id="startPracticeBtn" disabled>Start practice &rsaquo;</button>'+
        '</div>'
      ) : "";
      var html=masteryHtml+practiceBar+(masteryHtml?'<hr style="border:none;border-top:1px solid var(--rule);margin:18px 0;">':'')+
        '<p class="results-intro">Every completed round is saved here. The badge shows how many times you\u2019ve missed each question across all your runs — the higher, the more worth drilling.</p>';
      Object.keys(groups).forEach(function(key){
        var runs=groups[key].slice().sort(function(a,b){ return b.t-a.t; });
        var modeId=key.split("|@|")[1];
        var label=(runs[0] && runs[0].sectionLabel) ? runs[0].sectionLabel : key.split("|@|")[0];
        html+='<p class="rp-title">'+esc(label)+' · '+esc(MODE_LABELS[modeId]||modeId)+' — '+runs.length+(runs.length===1?" run":" runs")+'</p>';
        var freq={}; runs.forEach(function(r){ (r.missed||[]).forEach(function(q){ freq[q]=(freq[q]||0)+1; }); });
        var items=Object.keys(freq).sort(function(a,b){ return freq[b]-freq[a]; });
        if(!items.length){ html+='<p class="run-perfect">No misses recorded here. 🎉</p>'; }
        else { html+='<div>'; items.forEach(function(q){ var n=freq[q]; html+='<div class="miss-item"><div class="miss-q">'+esc(q)+'</div><span class="miss-count '+(n===1?"count-1":"")+'">'+n+'×</span></div>'; }); html+='</div>'; }
        html+='<div>'; runs.forEach(function(r){
          var mt=(r.missed&&r.missed.length)?'<span class="m">Missed:</span> '+r.missed.map(esc).join(", "):('<span class="'+(r.partial?"":"run-perfect")+'">'+(r.partial?"No misses so far.":"Perfect run.")+'</span>');
          var metaText = r.partial
            ? (r.attempted+" of "+r.total+" attempted (stopped early) \u2014 "+r.score+" correct")
            : ((r.mode==="mc"||r.mode==="match")?(r.score+" / "+r.total+" correct"):(r.score+" of "+r.total+" known"));
          html+='<div class="run-row"><span class="run-when">'+fmtDate(r.t)+'</span>'+
            '<span class="run-meta">'+metaText+'</span>'+
            '<div class="run-missed">'+mt+'</div></div>';
        }); html+='</div>';
      });
      html+='<div class="action-row" style="margin-top:18px;"><button class="link-btn" id="clearHistBtn">Clear results history</button></div>';
      elResultsBody.innerHTML=html;
      document.getElementById("clearHistBtn").onclick=async function(){ await clearHistory(); openResults(); };

      if(masteryHtml){
        var practiceCountEl = document.getElementById("practiceCount");
        var startPracticeBtn = document.getElementById("startPracticeBtn");
        function refreshPracticeBar(){
          var n = practiceSelected.length;
          practiceCountEl.textContent = n + " of 5 words selected for focused practice";
          startPracticeBtn.disabled = (n < 1);
          elResultsBody.querySelectorAll(".practice-check").forEach(function(cb){
            var idx = Number(cb.dataset.idx);
            var isChecked = practiceSelected.indexOf(idx) !== -1;
            cb.checked = isChecked;
            cb.disabled = (!isChecked && n >= 5);
          });
        }
        elResultsBody.querySelectorAll(".practice-check").forEach(function(cb){
          cb.onchange = function(){
            var idx = Number(cb.dataset.idx);
            if(cb.checked){ if(practiceSelected.indexOf(idx)===-1 && practiceSelected.length<5) practiceSelected.push(idx); }
            else { practiceSelected = practiceSelected.filter(function(i){ return i!==idx; }); }
            refreshPracticeBar();
          };
        });
        startPracticeBtn.onclick = function(){
          var chosen = practiceSelected.map(function(i){ return practiceCandidates[i].card; });
          if(chosen.length) startFocusedPractice(chosen);
        };
        refreshPracticeBar();
      }
    }
    function closeResults(){ elResults.classList.add("hidden"); elViewResults.style.display=""; elStudyCard.classList.remove("hidden"); }
    function fmtDate(ts){ try{ var d=new Date(ts); var mo=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return mo[d.getMonth()]+" "+d.getDate()+", "+d.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"}); }catch(e){ return ""; } }

    // ---- Focused Practice: pick up to 5 words in Results, copy-practice them
    // 5x each, then a mini quiz on just those words. ----
    function startFocusedPractice(cards){
      elResults.classList.add("hidden");
      elPractice.classList.remove("hidden");
      renderCopyPractice(cards);
    }
    function closePractice(){ elPractice.classList.add("hidden"); elResults.classList.remove("hidden"); }

    var practiceLastFocused = null;
    function renderCopyPractice(cards){
      var html = '<p class="sub" style="margin:0 0 12px;">Write each word 5 times, then a quick quiz on just these '+cards.length+'.</p>'+
        accentRow("practiceAccentTarget")+
        '<div class="practice-grid">';
      cards.forEach(function(card, ci){
        var badge = card.changed ? '<span class="changed-badge">corrected</span>' : '';
        html += '<div class="practice-word-card">'+
          '<p class="practice-word-en">'+esc(card.q)+'</p>'+
          '<p class="practice-word-es">'+esc(card.a)+badge+'</p>'+
          '<div class="practice-reps">'+
            [0,1,2,3,4].map(function(){ return '<input type="text" class="conj-input practice-rep-input" data-ci="'+ci+'" autocomplete="off" autocapitalize="off" spellcheck="false">'; }).join("")+
          '</div>'+
        '</div>';
      });
      html += '</div><div class="action-row"><button class="btn btn-primary" id="toQuizBtn">Continue to mini quiz &rsaquo;</button></div>';
      elPracticeBody.innerHTML = html;

      practiceLastFocused = null;
      elPracticeBody.querySelectorAll(".practice-rep-input").forEach(function(inp){
        inp.addEventListener("focus", function(){ practiceLastFocused = inp; });
        inp.addEventListener("blur", function(){
          var val = inp.value.trim();
          inp.classList.remove("conj-ok","conj-bad");
          if(!val) return;
          var card = cards[Number(inp.dataset.ci)];
          inp.classList.add(strictEqual(val, card.a) ? "conj-ok" : "conj-bad");
        });
      });
      elPracticeBody.querySelectorAll(".accent-row .accent-key").forEach(function(btn){
        btn.addEventListener("mousedown", function(e){ e.preventDefault(); });
        btn.onclick = function(){
          var el = practiceLastFocused;
          if(!el || !document.contains(el)) return;
          var s=el.selectionStart==null?el.value.length:el.selectionStart;
          var e2=el.selectionEnd==null?el.value.length:el.selectionEnd;
          el.value = el.value.slice(0,s)+btn.dataset.char+el.value.slice(e2);
          el.focus(); try{ el.setSelectionRange(s+1,s+1); }catch(_){}
        };
      });
      document.getElementById("toQuizBtn").onclick = function(){ renderFocusedQuiz(cards); };
    }

    function renderFocusedQuiz(cards){
      var quizOrder = shuffle(cards.length);
      var quizPos = 0, quizMissed = [], quizAnswered = false;

      function renderQ(){
        if(quizPos >= quizOrder.length){ finishQuiz(); return; }
        quizAnswered = false;
        var card = cards[quizOrder[quizPos]];
        elPracticeBody.innerHTML =
          '<p class="prompt-eyebrow">Mini quiz \u2014 question '+(quizPos+1)+' of '+quizOrder.length+'</p>'+
          '<p class="prompt">'+esc(card.q)+'</p>'+
          '<textarea class="write-area" id="focusQuizBox" rows="1" placeholder="Type your answer..."></textarea>'+
          accentRow("focusQuizBox")+
          '<div class="action-row"><button class="btn btn-primary" id="focusCheckBtn">Check answer</button></div>'+
          '<div id="focusRevealArea"></div>';
        var box = document.getElementById("focusQuizBox"); box.focus();
        wireAccents(elPracticeBody, box);
        document.getElementById("focusCheckBtn").onclick = function(){
          if(quizAnswered) return; quizAnswered = true;
          box.disabled = true; document.getElementById("focusCheckBtn").disabled = true;
          var blank = !box.value.trim();
          var autoCorrect = !blank && strictEqual(box.value, card.a);
          var subLine = blank ? "Nothing was typed." : (autoCorrect ? "Exact match." : "That doesn\u2019t match \u2014 check spelling and accents.");
          var badge = card.changed ? '<span class="changed-badge">corrected</span>' : '';
          function renderVerdict(isCorrect){
            var banner='<div class="verdict '+(isCorrect?"correct":"wrong")+'">'+
              '<p class="v-line">'+(isCorrect?"Marked correct":"Marked as missed")+'</p>'+
              '<p class="v-sub">'+subLine+' You can change this below.</p></div>';
            var actions='<div class="verdict-actions"><p class="lead">'+(isCorrect?"Not right after all?":"Actually got it?")+'</p>'+
              '<div class="action-row">'+
                (isCorrect?'<button class="btn btn-ghost" id="focusFlipBtn">Change to missed</button>':'<button class="btn btn-ghost" id="focusFlipBtn">Change to correct</button>')+
                '<button class="btn btn-primary" id="focusAcceptBtn">Accept &amp; continue &rsaquo;</button>'+
              '</div></div>';
            document.getElementById("focusRevealArea").innerHTML =
              '<div class="model-answer"><p class="ma-tag">Answer'+badge+'</p><p>'+esc(card.a)+'</p></div>'+
              changedNote(card)+'<div id="focusVerdictWrap">'+banner+actions+'</div>';
            document.getElementById("focusFlipBtn").onclick=function(){ renderVerdict(!isCorrect); };
            document.getElementById("focusAcceptBtn").onclick=function(){
              recordAttempt(card, "write", isCorrect);
              if(!isCorrect) quizMissed.push(card.q);
              quizPos++; renderQ();
            };
          }
          renderVerdict(autoCorrect);
        };
      }

      async function finishQuiz(){
        var total = cards.length;
        var um = uniq(quizMissed);
        var score = total - um.length;
        await appendHistory({ t:Date.now(), section:"focused-practice", sectionLabel:"Focused Practice", mode:"write", total:total, score:score, missed: um });
        var reviewHtml;
        if(um.length){
          reviewHtml = '<div class="review-block"><p class="review-title">Review these ('+um.length+'):</p><ul class="review-list">'+
            um.map(function(q){ return '<li><span class="rq">'+esc(q)+'</span></li>'; }).join("")+'</ul></div>';
        } else {
          reviewHtml = '<p class="review-perfect">Perfect \u2014 '+total+' for '+total+'! \ud83c\udf89</p>';
        }
        elPracticeBody.innerHTML =
          '<div class="summary"><p class="big">'+score+' / '+total+'</p><p>correct</p>'+reviewHtml+
          '<div class="action-row" style="justify-content:center"><button class="btn btn-primary" id="practiceDoneBtn">Back to results</button></div></div>';
        document.getElementById("practiceDoneBtn").onclick = function(){ closePractice(); openResults(); };
      }

      renderQ();
    }
    elClosePractice.onclick = function(){ closePractice(); };

    elViewResults.onclick=openResults; elCloseResults.onclick=closeResults;
    elStopRound.onclick = async function(){ await startRun(); openResults(); };

    // ---- Init ----
    renderChips(); startRun();
  }

  return { mount: mount };
})();
