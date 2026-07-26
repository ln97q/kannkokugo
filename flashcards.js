(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const notesKey = "koreanQuizQuestionNotesV1";
  const state = { all: [], cards: [], index: 0, flipped: false, difficulty: 0, randomFronts: {} };

  function safeParse(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; } }
  function saveJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function bank() { return Array.isArray(window.QUESTION_BANK) ? window.QUESTION_BANK : []; }
  function shuffle(items) { const a = [...items]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
  function selectedLessons() { return $$("#flashLessonChips input:checked").map(x => x.value); }
  function normalize(v) { return String(v ?? "").trim().replace(/\s+/g," "); }

  function buildCards() {
    const map = new Map();
    bank().filter(q => q.mode === "vocab").forEach(q => {
      let korean = "", japanese = "";
      if (/韓国語/.test(q.prompt || "")) { korean = normalize(q.answer); japanese = normalize(q.text); }
      else if (/日本語/.test(q.prompt || "")) { korean = normalize(q.text); japanese = normalize(q.answer); }
      if (!korean || !japanese) return;
      const key = `${q.lesson}|${korean}|${japanese}`;
      if (!map.has(key)) map.set(key, { key, lesson:String(q.lesson), korean, japanese, ids:[], explanations:[], hints:[] });
      const card = map.get(key);
      card.ids.push(q.id);
      if (q.explanation && !card.explanations.includes(q.explanation)) card.explanations.push(q.explanation);
      if (q.hint && !card.hints.includes(q.hint)) card.hints.push(q.hint);
    });
    return Array.from(map.values());
  }

  function mergedNote(card) {
    const notes = safeParse(notesKey, {});
    const found = card.ids.map(id => notes[id]).filter(x => x && typeof x === "object");
    return {
      memo: String(found.find(x => x.memo)?.memo || ""),
      difficulty: Math.max(0, ...found.map(x => Number(x.difficulty)||0)),
      learned: found.length > 0 && found.every(x => Boolean(x.learned))
    };
  }

  function paintDifficulty(level) {
    state.difficulty = Math.max(0, Math.min(5, Number(level)||0));
    $$("#flashDifficultyButtons button").forEach(b => {
      const on = Number(b.dataset.level) <= state.difficulty;
      b.classList.toggle("active", on); b.setAttribute("aria-pressed", on ? "true":"false");
    });
  }

  function saveCurrent(show = true) {
    const card = state.cards[state.index]; if (!card) return;
    const notes = safeParse(notesKey, {});
    const memo = $("#flashMemo").value.trim();
    const learned = $("#flashLearned").checked;
    card.ids.forEach(id => {
      if (!memo && !state.difficulty && !learned) delete notes[id];
      else notes[id] = { memo, difficulty:state.difficulty, learned, updatedAt:Date.now() };
    });
    saveJSON(notesKey, notes);
    if (show) { $("#flashNoteStatus").textContent="保存しました"; setTimeout(()=>{$("#flashNoteStatus").textContent="保存済み";},900); }
    applyFilters(false);
  }

  function frontLanguage(card) {
    const mode = $("#frontMode").value;
    if (mode !== "random") return mode;
    if (!state.randomFronts[card.key]) state.randomFronts[card.key] = Math.random() < .5 ? "korean" : "japanese";
    return state.randomFronts[card.key];
  }

  function render() {
    const card = state.cards[state.index];
    const empty = !card;
    $("#emptyCards").classList.toggle("hidden", !empty);
    $("#flashcardStudy").classList.toggle("hidden", empty);
    if (empty) return;
    state.flipped = false;
    const lang = frontLanguage(card);
    const frontKorean = lang === "korean";
    $("#frontLabel").textContent = frontKorean ? "韓国語" : "日本語";
    $("#backLabel").textContent = frontKorean ? "日本語" : "韓国語";
    $("#frontText").textContent = frontKorean ? card.korean : card.japanese;
    $("#backText").textContent = frontKorean ? card.japanese : card.korean;
    $("#cardExplanation").textContent = `${card.explanations[0] || ""}\n\n💡 覚え方\n${card.hints[0] || "声に出して3回練習しましょう。"}`;
    $("#backArea").classList.add("hidden");
    $("#frontHint").classList.remove("hidden");
    $("#flipCardBtn").textContent = "答えを見る";
    $("#flashcard").setAttribute("aria-pressed","false");
    $("#cardPosition").textContent = `${state.index+1} / ${state.cards.length}`;
    const note = mergedNote(card);
    $("#cardStatus").textContent = `${note.learned ? "✅ 覚えた" : "未習得"}${note.difficulty ? `・苦手度${note.difficulty}` : ""}`;
    $("#flashMemo").value = note.memo;
    $("#flashLearned").checked = note.learned;
    $("#flashNoteStatus").textContent = note.memo || note.difficulty || note.learned ? "保存済み" : "";
    paintDifficulty(note.difficulty);
  }

  function flip() {
    if (!state.cards.length) return;
    state.flipped = !state.flipped;
    $("#backArea").classList.toggle("hidden", !state.flipped);
    $("#frontHint").classList.toggle("hidden", state.flipped);
    $("#flipCardBtn").textContent = state.flipped ? "表に戻す" : "答えを見る";
    $("#flashcard").setAttribute("aria-pressed", state.flipped ? "true":"false");
  }

  function applyFilters(resetIndex = true) {
    const lessons = selectedLessons();
    const filter = $("#cardFilter").value;
    const currentKey = state.cards[state.index]?.key;
    state.cards = state.all.filter(card => {
      if (!lessons.includes(card.lesson)) return false;
      const n = mergedNote(card);
      if (filter === "unlearned") return !n.learned;
      if (filter === "learned") return n.learned;
      if (filter === "difficult") return n.difficulty >= 3;
      if (filter === "memo") return Boolean(n.memo);
      return true;
    });
    if (resetIndex) state.index = 0;
    else {
      const found = state.cards.findIndex(c => c.key === currentKey);
      state.index = found >= 0 ? found : Math.min(state.index, Math.max(0,state.cards.length-1));
    }
    render();
  }

  function move(delta) { if (!state.cards.length) return; saveCurrent(false); state.index=(state.index+delta+state.cards.length)%state.cards.length; render(); window.scrollTo({top:0,behavior:"smooth"}); }

  try {
    state.all = buildCards();
    if (!state.all.length) throw new Error("単語データを読み込めませんでした。");
    $$("#flashLessonChips input").forEach(x => x.addEventListener("change",()=>applyFilters(true)));
    $("#cardFilter").addEventListener("change",()=>applyFilters(true));
    $("#frontMode").addEventListener("change",()=>{state.randomFronts={};render();});
    $("#flashcard").addEventListener("click",flip); $("#flipCardBtn").addEventListener("click",flip);
    $("#prevCardBtn").addEventListener("click",()=>move(-1)); $("#nextCardBtn").addEventListener("click",()=>move(1));
    $("#shuffleBtn").addEventListener("click",()=>{saveCurrent(false);state.cards=shuffle(state.cards);state.index=0;state.randomFronts={};render();});
    $("#resetCardsBtn").addEventListener("click",()=>{saveCurrent(false);state.index=0;render();});
    $$("#flashDifficultyButtons button").forEach(b=>b.addEventListener("click",()=>{const n=Number(b.dataset.level)||0;paintDifficulty(n===state.difficulty?0:n);$("#flashNoteStatus").textContent="未保存";}));
    $("#flashMemo").addEventListener("input",()=>{$("#flashNoteStatus").textContent="未保存";});
    $("#flashLearned").addEventListener("change",()=>{$("#flashNoteStatus").textContent="未保存";});
    $("#saveFlashNoteBtn").addEventListener("click",()=>saveCurrent(true));
    applyFilters(true);
  } catch (e) {
    console.error(e); const box=document.createElement("div"); box.className="error-box"; box.textContent=e.message||"読み込みエラー"; document.body.prepend(box);
  }
})();
