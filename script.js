(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const statsKey = "koreanQuizStatsV1";
  const mistakesKey = "koreanQuizMistakesV1";
  const notesKey = "koreanQuizQuestionNotesV1";

  const state = {
    mode: "mixed", count: 10, queue: [], index: 0, score: 0,
    selectedChoice: null, answered: false, marked: false,
    lastSettings: null, wrongItems: [], currentDifficulty: 0
  };

  function safeParse(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (_) { return fallback; }
  }
  function getStats() { return safeParse(statsKey, { answered: 0, correct: 0 }); }
  function getMistakes() { return safeParse(mistakesKey, {}); }
  function getQuestionNotes() { return safeParse(notesKey, {}); }
  function getQuestionNote(id) {
    const notes = getQuestionNotes();
    const saved = notes[id];
    return saved && typeof saved === "object"
      ? { memo: String(saved.memo || ""), difficulty: Number(saved.difficulty) || 0, learned: Boolean(saved.learned) }
      : { memo: "", difficulty: 0, learned: false };
  }
  function saveJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function questionBank() { return Array.isArray(window.QUESTION_BANK) ? window.QUESTION_BANK : []; }
  function choicesOf(q) { return Array.isArray(q && q.choices) ? q.choices : []; }
  function acceptedOf(q) { return Array.isArray(q && q.accepted) ? q.accepted : [q && q.answer]; }
  function tagsOf(q) { return Array.isArray(q && q.tags) ? q.tags : []; }
  function normalize(value) {
    return String(value ?? "").trim().replace(/[。、，]/g, "").replace(/\s+/g, " ")
      .replace(/[？?！!]+$/g, "").toLowerCase();
  }
  function shuffle(items) {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function showView(selector) {
    $$(".view").forEach(v => v.classList.remove("active"));
    const target = $(selector);
    if (target) target.classList.add("active");
    window.scrollTo(0, 0);
  }
  function selectedLessons() { return $$("#lessonChips input:checked").map(i => i.value); }

  function paintDifficulty(level) {
    state.currentDifficulty = Math.max(0, Math.min(5, Number(level) || 0));
    $$("#difficultyButtons button").forEach(button => {
      const active = Number(button.dataset.level) <= state.currentDifficulty;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function loadQuestionNote(q) {
    const note = getQuestionNote(q.id);
    $("#questionMemo").value = note.memo;
    $("#learnedCheck").checked = note.learned;
    $("#noteSaveStatus").textContent = note.memo || note.difficulty || note.learned ? "保存済み" : "";
    paintDifficulty(note.difficulty);
  }

  function saveCurrentQuestionNote(showMessage = true) {
    const q = state.queue[state.index];
    if (!q) return;
    const notes = getQuestionNotes();
    const memo = $("#questionMemo").value.trim();
    const learned = $("#learnedCheck").checked;
    if (!memo && !state.currentDifficulty && !learned) delete notes[q.id];
    else notes[q.id] = { memo, difficulty: state.currentDifficulty, learned, updatedAt: Date.now() };
    saveJSON(notesKey, notes);
    if (showMessage) {
      $("#noteSaveStatus").textContent = "保存しました";
      window.setTimeout(() => {
        if ($("#noteSaveStatus").textContent === "保存しました") $("#noteSaveStatus").textContent = "保存済み";
      }, 1200);
    }
  }

  function updateStatsUI() {
    const stats = getStats();
    const mistakes = getMistakes();
    $("#totalAnswered").textContent = stats.answered || 0;
    $("#accuracyRate").textContent = stats.answered ? `${Math.round((stats.correct || 0) / stats.answered * 100)}%` : "0%";
    $("#mistakeCount").textContent = Object.keys(mistakes).length;
  }

  function saveMistake(id, isCorrect) {
    const mistakes = getMistakes();
    if (isCorrect) {
      if (mistakes[id]) mistakes[id] -= 1;
      if (!mistakes[id] || mistakes[id] <= 0) delete mistakes[id];
    } else {
      mistakes[id] = (mistakes[id] || 0) + 1;
    }
    saveJSON(mistakesKey, mistakes);
  }

  function filterBank(mode) {
    const all = questionBank();
    const lessons = selectedLessons();
    let bank = all.filter(q => lessons.includes(String(q.lesson)) || (lessons.includes("priority") && q.priority));

    if (mode === "vocab") bank = bank.filter(q => q.mode === "vocab");
    if (mode === "grammar") bank = bank.filter(q => ["grammar", "mixed"].includes(q.mode) && q.category !== "単語");
    if (mode === "focus") bank = bank.filter(q => tagsOf(q).some(t => ["demonstrative", "position", "verb", "conjugation"].includes(t)));
    if (mode === "priority") bank = all.filter(q => q.priority);
    if (mode === "handwriting") bank = bank.filter(q => q.mode === "handwriting");
    if (mode === "countries") bank = all.filter(q => tagsOf(q).includes("country"));
    if (mode === "mistakes") {
      const ids = new Set(Object.keys(getMistakes()));
      bank = all.filter(q => ids.has(q.id));
    }
    if (mode === "mixed") bank = bank.filter(q => q.mode !== "handwriting");
    return shuffle(bank);
  }

  function startQuiz(mode) {
    const bank = filterBank(mode);
    if (!bank.length) {
      alert(mode === "mistakes" ? "まだ間違い記録がありません。" : "選んだ条件に問題がありません。出題範囲を確認してください。");
      return;
    }
    state.mode = mode;
    state.index = 0;
    state.score = 0;
    state.wrongItems = [];
    state.queue = state.count === 999 ? bank : bank.slice(0, Math.min(state.count, bank.length));
    state.lastSettings = { mode, count: state.count };
    showView("#quizView");
    renderQuestion();
  }

  function renderQuestion() {
    const q = state.queue[state.index];
    if (!q) { showResults(); return; }
    state.answered = false;
    state.marked = false;
    state.selectedChoice = null;

    $("#progressText").textContent = `${state.index + 1} / ${state.queue.length}`;
    $("#progressBar").style.width = `${((state.index + 1) / state.queue.length) * 100}%`;
    $("#lessonBadge").textContent = q.priority ? "重要" : `第${q.lesson}課`;
    $("#categoryBadge").textContent = q.category || "問題";
    $("#questionPrompt").textContent = q.prompt || "答えてください";
    $("#questionText").textContent = q.text || "";
    $("#questionHint").textContent = q.hint || "";
    $("#feedback").classList.add("hidden");
    $("#checkBtn").classList.remove("hidden");
    $("#showAnswerBtn").classList.add("hidden");
    $("#choiceArea").replaceChildren();
    $("#textAnswer").value = "";
    loadQuestionNote(q);

    const choices = choicesOf(q);
    const handwriting = q.mode === "handwriting";
    $("#inputArea").classList.toggle("hidden", choices.length > 0 || handwriting);
    $("#canvasArea").classList.toggle("hidden", !handwriting);

    if (handwriting) {
      $("#checkBtn").classList.add("hidden");
      $("#showAnswerBtn").classList.remove("hidden");
      requestAnimationFrame(() => { resizeCanvas(); clearCanvas(); });
    }

    choices.forEach(choice => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-btn";
      button.textContent = choice;
      button.addEventListener("click", () => {
        if (state.answered) return;
        $$(".choice-btn").forEach(b => b.classList.remove("selected"));
        button.classList.add("selected");
        state.selectedChoice = choice;
      });
      $("#choiceArea").appendChild(button);
    });
  }

  function isAnswerCorrect(q, value) {
    const answer = normalize(value);
    if (!answer) return false;
    if (q.id === "7p1") {
      const known = ["침대","책상","컴퓨터","의자","시계","가방","책","사전","노트","핸드폰","지갑","카메라"];
      return known.filter(word => answer.includes(word)).length >= 3 && answer.includes("있습니다");
    }
    return acceptedOf(q).some(item => normalize(item) === answer);
  }

  function finishMark(correct, q, value = "") {
    if (state.marked) return;
    state.marked = true;
    if (correct) state.score += 1;
    else state.wrongItems.push({ q, value });
    const stats = getStats();
    stats.answered = (stats.answered || 0) + 1;
    stats.correct = (stats.correct || 0) + (correct ? 1 : 0);
    saveJSON(statsKey, stats);
    saveMistake(q.id, correct);
  }

  function reveal(force = false) {
    if (state.answered) return;
    const q = state.queue[state.index];
    const choices = choicesOf(q);
    const value = choices.length ? state.selectedChoice : $("#textAnswer").value;
    const handwriting = q.mode === "handwriting";
    if (!force && !handwriting && !value) { alert("答えを入力または選択してください。"); return; }

    state.answered = true;
    $("#feedback").classList.remove("hidden");
    $("#correctAnswer").textContent = q.answer || "";
    $("#explanationBox").textContent = `解説\n${q.explanation || ""}`;
    $("#selfGradeArea").classList.toggle("hidden", !handwriting);
    $("#checkBtn").classList.add("hidden");
    $("#showAnswerBtn").classList.add("hidden");

    if (handwriting) {
      $("#resultHeadline").textContent = "答えを確認してください";
      $("#resultHeadline").className = "result-headline";
      return;
    }

    const correct = isAnswerCorrect(q, value);
    $("#resultHeadline").textContent = correct ? "○ 正解！" : "× 不正解";
    $("#resultHeadline").className = `result-headline ${correct ? "ok" : "ng"}`;
    finishMark(correct, q, value);

    if (choices.length) {
      $$(".choice-btn").forEach(button => {
        if (normalize(button.textContent) === normalize(q.answer)) button.classList.add("correct");
        if (button.classList.contains("selected") && normalize(button.textContent) !== normalize(q.answer)) button.classList.add("wrong");
      });
    }
  }

  function nextQuestion() {
    saveCurrentQuestionNote(false);
    if (state.queue[state.index]?.mode === "handwriting" && !state.marked) {
      alert("「書けた」か「書けなかった」を選んでください。");
      return;
    }
    state.index += 1;
    if (state.index >= state.queue.length) showResults();
    else renderQuestion();
  }

  function showResults() {
    const total = state.queue.length || 1;
    const percentage = Math.round(state.score / total * 100);
    $("#finalScore").textContent = percentage;
    $("#correctCount").textContent = state.score;
    $("#wrongCount").textContent = total - state.score;
    $("#finalMessage").textContent = percentage === 100 ? "満点！この範囲は仕上がっています。" :
      percentage >= 80 ? "かなり良いです。間違えた問題だけもう一周！" :
      percentage >= 60 ? "あと少し。解説を見ながら復習しよう。" : "短い回数で何周もすると覚えやすいです。";

    const review = $("#reviewList");
    review.replaceChildren();
    state.wrongItems.slice(0, 20).forEach(({ q, value }) => {
      const item = document.createElement("div");
      item.className = "review-item";
      const question = document.createElement("strong");
      const answer = document.createElement("span");
      question.textContent = q.text || "";
      answer.textContent = `あなた：${value || "未回答"} ／ 正解：${q.answer || ""}`;
      item.append(question, answer);
      review.appendChild(item);
    });
    updateStatsUI();
    showView("#resultView");
  }

  const canvas = $("#writeCanvas");
  const ctx = canvas.getContext("2d");
  let drawing = false;
  let activePointer = null;
  let paths = [];
  let currentPath = [];

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function redrawCanvas() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#183247";
    paths.forEach(path => {
      if (!path.length) return;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      path.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      if (path.length === 1) ctx.lineTo(path[0].x + .2, path[0].y + .2);
      ctx.stroke();
    });
  }
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    redrawCanvas();
  }
  function clearCanvas() { paths = []; currentPath = []; redrawCanvas(); }
  canvas.addEventListener("pointerdown", event => {
    event.preventDefault();
    drawing = true;
    activePointer = event.pointerId;
    canvas.setPointerCapture?.(event.pointerId);
    currentPath = [canvasPoint(event)];
    paths.push(currentPath);
    redrawCanvas();
  });
  canvas.addEventListener("pointermove", event => {
    if (!drawing || event.pointerId !== activePointer) return;
    event.preventDefault();
    currentPath.push(canvasPoint(event));
    redrawCanvas();
  });
  function stopDrawing(event) {
    if (event.pointerId !== activePointer) return;
    event.preventDefault();
    drawing = false;
    activePointer = null;
  }
  canvas.addEventListener("pointerup", stopDrawing);
  canvas.addEventListener("pointercancel", stopDrawing);
  canvas.addEventListener("lostpointercapture", () => { drawing = false; activePointer = null; });

  function bindEvents() {
    $$(".count-btn").forEach(button => button.addEventListener("click", () => {
      $$(".count-btn").forEach(b => b.classList.remove("active"));
      button.classList.add("active");
      state.count = Number(button.dataset.count) || 10;
    }));
    $$(".mode-card").forEach(button => button.addEventListener("click", () => startQuiz(button.dataset.mode)));
    $("#checkBtn").addEventListener("click", () => reveal(false));
    $("#showAnswerBtn").addEventListener("click", () => reveal(true));
    $("#nextBtn").addEventListener("click", nextQuestion);
    $("#clearCanvasBtn").addEventListener("click", clearCanvas);
    $("#undoCanvasBtn").addEventListener("click", () => { paths.pop(); redrawCanvas(); });
    $$("#difficultyButtons button").forEach(button => button.addEventListener("click", () => {
      const clicked = Number(button.dataset.level) || 0;
      paintDifficulty(clicked === state.currentDifficulty ? 0 : clicked);
      $("#noteSaveStatus").textContent = "未保存";
    }));
    $("#questionMemo").addEventListener("input", () => { $("#noteSaveStatus").textContent = "未保存"; });
    $("#learnedCheck").addEventListener("change", () => { $("#noteSaveStatus").textContent = "未保存"; });
    $("#saveNoteBtn").addEventListener("click", () => saveCurrentQuestionNote(true));
    $("#selfCorrectBtn").addEventListener("click", () => { const q = state.queue[state.index]; finishMark(true, q, "手書き自己採点：○"); nextQuestion(); });
    $("#selfWrongBtn").addEventListener("click", () => { const q = state.queue[state.index]; finishMark(false, q, "手書き自己採点：×"); nextQuestion(); });
    $("#backHomeBtn").addEventListener("click", () => { if (confirm("クイズを終了してホームに戻りますか？")) { saveCurrentQuestionNote(false); updateStatsUI(); showView("#homeView"); } });
    $("#resultHomeBtn").addEventListener("click", () => { updateStatsUI(); showView("#homeView"); });
    $("#retryBtn").addEventListener("click", () => startQuiz(state.lastSettings?.mode || "mixed"));
    $("#textAnswer").addEventListener("keydown", event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") reveal(false); });
    window.addEventListener("resize", () => { if (!$("#canvasArea").classList.contains("hidden")) resizeCanvas(); });
  }

  function fatal(message) {
    const box = document.createElement("div");
    box.className = "error-box";
    box.textContent = message;
    document.body.prepend(box);
  }

  try {
    if (!questionBank().length) throw new Error("問題データを読み込めませんでした。questions.js が同じフォルダにあるか確認してください。");
    bindEvents();
    updateStatsUI();
  } catch (error) {
    console.error(error);
    fatal(error.message || "読み込みエラーが発生しました。");
  }
})();
