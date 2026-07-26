(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const state = {
    mode: "mixed", count: 10, queue: [], index: 0, score: 0,
    selectedChoice: null, answered: false, lastSettings: null, wrongItems: []
  };
  const statsKey = "koreanQuizStatsV1";
  const mistakesKey = "koreanQuizMistakesV1";
  const getStats = () => JSON.parse(localStorage.getItem(statsKey) || '{"answered":0,"correct":0}');
  const getMistakes = () => JSON.parse(localStorage.getItem(mistakesKey) || '{}');
  const saveMistake = (id, isCorrect) => {
    const m = getMistakes();
    if (isCorrect) {
      if (m[id]) m[id] = Math.max(0, m[id] - 1);
      if (m[id] === 0) delete m[id];
    } else m[id] = (m[id] || 0) + 1;
    localStorage.setItem(mistakesKey, JSON.stringify(m));
  };
  const updateStatsUI = () => {
    const s = getStats(), m = getMistakes();
    $("#totalAnswered").textContent = s.answered;
    $("#accuracyRate").textContent = s.answered ? Math.round(s.correct / s.answered * 100) + "%" : "0%";
    $("#mistakeCount").textContent = Object.keys(m).length;
  };
  const showView = id => {
    $$(".view").forEach(v => v.classList.remove("active"));
    $(id).classList.add("active");
    window.scrollTo({top:0,behavior:"smooth"});
  };
  const normalize = v => (v || "").trim().replace(/[。、，]/g,"").replace(/\s+/g," ").replace(/[？?]+$/,"").replace(/[！!]+$/,"");
  const shuffle = arr => [...arr].sort(() => Math.random() - .5);
  const selectedLessons = () => $$("#lessonChips input:checked").map(i => i.value);
  const filterBank = mode => {
    const lessons = selectedLessons();
    let bank = QUESTION_BANK.filter(q => lessons.includes(q.lesson) || (lessons.includes("priority") && q.priority));
    if (mode === "vocab") bank = bank.filter(q => q.mode === "vocab");
    if (mode === "grammar") bank = bank.filter(q => ["grammar","mixed"].includes(q.mode) && q.category !== "単語");
    if (mode === "focus") bank = bank.filter(q => q.tags.some(t => ["demonstrative","position","verb","conjugation"].includes(t)));
    if (mode === "priority") bank = QUESTION_BANK.filter(q => q.priority);
    if (mode === "handwriting") bank = bank.filter(q => q.mode === "handwriting");
    if (mode === "countries") bank = QUESTION_BANK.filter(q => q.tags.includes("country"));
    if (mode === "mistakes") {
      const ids = Object.keys(getMistakes());
      bank = QUESTION_BANK.filter(q => ids.includes(q.id));
    }
    if (mode === "mixed") bank = bank.filter(q => q.mode !== "handwriting");
    return shuffle(bank);
  };
  const startQuiz = mode => {
    const bank = filterBank(mode);
    if (!bank.length) {
      alert(mode === "mistakes" ? "まだ間違い記録がありません。" : "選んだ条件に問題がありません。");
      return;
    }
    state.mode = mode; state.index = 0; state.score = 0; state.wrongItems = [];
    state.queue = state.count === 999 ? bank : bank.slice(0, Math.min(state.count, bank.length));
    state.lastSettings = {mode, count: state.count};
    showView("#quizView"); renderQuestion();
  };
  const renderQuestion = () => {
    state.answered = false; state.selectedChoice = null;
    const q = state.queue[state.index];
    $("#progressText").textContent = `${state.index + 1} / ${state.queue.length}`;
    $("#progressBar").style.width = `${state.index / state.queue.length * 100}%`;
    $("#lessonBadge").textContent = q.priority ? "重要" : `第${q.lesson}課`;
    $("#categoryBadge").textContent = q.category;
    $("#questionPrompt").textContent = q.prompt;
    $("#questionText").textContent = q.text;
    $("#questionHint").textContent = q.hint || "";
    $("#feedback").classList.add("hidden");
    $("#showAnswerBtn").classList.add("hidden");
    $("#checkBtn").classList.remove("hidden");
    $("#choiceArea").innerHTML = "";
    $("#textAnswer").value = "";
    $("#inputArea").classList.toggle("hidden", q.choices.length > 0 || q.mode === "handwriting");
    $("#canvasArea").classList.toggle("hidden", q.mode !== "handwriting");
    if (q.mode === "handwriting") {
  $("#showAnswerBtn").classList.remove("hidden");
  $("#checkBtn").classList.add("hidden");

  requestAnimationFrame(() => {
    resizeCanvas();
    clearCanvas();
  });
}
    if (q.choices.length) {
      q.choices.forEach(c => {
        const b = document.createElement("button");
        b.className = "choice-btn"; b.textContent = c;
        b.onclick = () => {
          if (state.answered) return;
          $$(".choice-btn").forEach(x => x.classList.remove("selected"));
          b.classList.add("selected"); state.selectedChoice = c;
        };
        $("#choiceArea").appendChild(b);
      });
    }
  };
  const isAnswerCorrect = (q, value) => {
    const n = normalize(value);
    if (!n) return false;
    if (q.id === "7p1") {
      const known = ["침대","책상","컴퓨터","의자","시계","가방","책","사전","노트","핸드폰","지갑","카메라"];
      const count = known.filter(x => n.includes(x)).length;
      return count >= 3 && n.includes("있습니다");
    }
    return q.accepted.some(a => normalize(a) === n);
  };
  const reveal = (forcedHandwriting=false) => {
    if (state.answered) return;
    const q = state.queue[state.index];
    let value = q.choices.length ? state.selectedChoice : $("#textAnswer").value;
    if (!forcedHandwriting && q.mode !== "handwriting" && !value) { alert("答えを入力してください。"); return; }
    state.answered = true;
    const correct = q.mode === "handwriting" ? null : isAnswerCorrect(q, value);
    $("#feedback").classList.remove("hidden");
    $("#correctAnswer").textContent = q.answer;
    $("#explanationBox").textContent = "解説\n" + q.explanation;
    $("#selfGradeArea").classList.toggle("hidden", q.mode !== "handwriting");
    if (q.mode === "handwriting") {
      $("#resultHeadline").textContent = "答えを確認してください";
      $("#resultHeadline").className = "result-headline";
    } else {
      $("#resultHeadline").textContent = correct ? "○ 正解！" : "× 不正解";
      $("#resultHeadline").className = "result-headline " + (correct ? "ok" : "ng");
      finishMark(correct, q, value);
      if (q.choices.length) {
        $$(".choice-btn").forEach(btn => {
          if (normalize(btn.textContent) === normalize(q.answer)) btn.classList.add("correct");
          if (btn.classList.contains("selected") && normalize(btn.textContent) !== normalize(q.answer)) btn.classList.add("wrong");
        });
      }
    }
    $("#checkBtn").classList.add("hidden"); $("#showAnswerBtn").classList.add("hidden");
  };
  const finishMark = (correct, q, value="") => {
    if (correct) state.score++;
    else state.wrongItems.push({q, value});
    const s = getStats(); s.answered++; if (correct) s.correct++;
    localStorage.setItem(statsKey, JSON.stringify(s)); saveMistake(q.id, correct);
  };
  const next = () => {
    state.index++;
    if (state.index >= state.queue.length) return showResults();
    renderQuestion();
  };
  const showResults = () => {
    const pct = Math.round(state.score / state.queue.length * 100);
    $("#finalScore").textContent = pct;
    $("#correctCount").textContent = state.score;
    $("#wrongCount").textContent = state.queue.length - state.score;
    $("#finalMessage").textContent = pct === 100 ? "満点！この範囲はかなり仕上がっています。" :
      pct >= 80 ? "かなり良いです。間違えた問題だけもう一周すると安心！" :
      pct >= 60 ? "あと少し。解説を見ながら苦手だけ復習しよう。" :
      "今は覚える途中で大丈夫。短い回数で何周もするのがおすすめです。";
    $("#reviewList").innerHTML = "";
    state.wrongItems.slice(0,10).forEach(({q,value}) => {
      const d = document.createElement("div"); d.className = "review-item";
      d.innerHTML = `<strong>${q.text}</strong><span>あなた：${value || "未回答"} ／ 正解：${q.answer}</span>`;
      $("#reviewList").appendChild(d);
    });
    updateStatsUI(); showView("#resultView");
  };

 // Canvas（PC・スマホ対応）
const canvas = $("#writeCanvas");
const ctx = canvas.getContext("2d");

let drawing = false;
let paths = [];
let current = [];

canvas.style.touchAction = "none";

const resizeCanvas = () => {
  const rect = canvas.getBoundingClientRect();

  if (rect.width === 0 || rect.height === 0) return;

  const ratio = window.devicePixelRatio || 1;

  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  redraw();
};

const getPoint = e => {
  const rect = canvas.getBoundingClientRect();

  const touch = e.touches
    ? e.touches[0]
    : e.changedTouches
      ? e.changedTouches[0]
      : e;

  return {
    x: touch.clientX - rect.left,
    y: touch.clientY - rect.top
  };
};

const redraw = () => {
  const rect = canvas.getBoundingClientRect();

  ctx.clearRect(0, 0, rect.width, rect.height);

  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#183247";

  paths.forEach(path => {
    if (path.length === 0) return;

    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);

    path.slice(1).forEach(p => {
      ctx.lineTo(p.x, p.y);
    });

    if (path.length === 1) {
      ctx.lineTo(path[0].x + 0.1, path[0].y + 0.1);
    }

    ctx.stroke();
  });
};

const startDraw = e => {
  e.preventDefault();

  drawing = true;
  current = [getPoint(e)];
  paths.push(current);

  redraw();
};

const moveDraw = e => {
  if (!drawing) return;

  e.preventDefault();

  current.push(getPoint(e));
  redraw();
};

const endDraw = e => {
  if (!drawing) return;

  e.preventDefault();
  drawing = false;
};

const clearCanvas = () => {
  paths = [];
  current = [];
  redraw();
};

// PC
canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mousemove", moveDraw);
canvas.addEventListener("mouseup", endDraw);
canvas.addEventListener("mouseleave", endDraw);

// スマホ
canvas.addEventListener("touchstart", startDraw, { passive: false });
canvas.addEventListener("touchmove", moveDraw, { passive: false });
canvas.addEventListener("touchend", endDraw, { passive: false });
canvas.addEventListener("touchcancel", endDraw, { passive: false });

window.addEventListener("resize", resizeCanvas);

$("#clearCanvasBtn").onclick = clearCanvas;

$("#undoCanvasBtn").onclick = () => {
  paths.pop();
  redraw();
};
  $$(".count-btn").forEach(b => b.onclick = () => {
  $$(".count-btn").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  state.count = +b.dataset.count;
});

$$(".mode-card").forEach(b => {
  b.onclick = () => startQuiz(b.dataset.mode);
});

$("#checkBtn").onclick = () => reveal(false);
$("#showAnswerBtn").onclick = () => reveal(true);
$("#nextBtn").onclick = next;

$("#selfCorrectBtn").onclick = () => {
  const q = state.queue[state.index];
  finishMark(true, q, "手書き自己採点：○");
  next();
};

$("#selfWrongBtn").onclick = () => {
  const q = state.queue[state.index];
  finishMark(false, q, "手書き自己採点：×");
  next();
};

$("#backHomeBtn").onclick = () => {
  if (confirm("クイズを終了してホームに戻りますか？")) {
    updateStatsUI();
    showView("#homeView");
  }
};

$("#resultHomeBtn").onclick = () => {
  updateStatsUI();
  showView("#homeView");
};

$("#retryBtn").onclick = () => {
  startQuiz(state.lastSettings.mode);
};

updateStatsUI();
setTimeout(resizeCanvas, 100);

})();
