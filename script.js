import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAuR_FkgTgbDWjfCXMe5bxAWREdIQE0KOc",
  authDomain: "kannkokugo-e9d05.firebaseapp.com",
  projectId: "kannkokugo-e9d05",
  storageBucket: "kannkokugo-e9d05.firebasestorage.app",
  messagingSenderId: "935480336325",
  appId: "1:935480336325:web:791ef9614549d3f4ef35ac",
  measurementId: "G-J9JXWGN1PZ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await setPersistence(auth, browserLocalPersistence);

let currentUser = null;
let cloudSaveTimer = null;
let cloudLoaded = false;

const authGate = document.querySelector("#authGate");
const authMessage = document.querySelector("#authMessage");
const authEmail = document.querySelector("#authEmail");
const authPassword = document.querySelector("#authPassword");
const syncStatus = document.querySelector("#syncStatus");

function setAuthMessage(message, ok = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle("ok", ok);
}

function friendlyAuthError(error) {
  const code = error?.code || "";
  if (code.includes("invalid-credential")) return "メールアドレスまたはパスワードが違います。";
  if (code.includes("email-already-in-use")) return "このメールアドレスはすでに登録されています。";
  if (code.includes("weak-password")) return "パスワードは6文字以上にしてください。";
  if (code.includes("invalid-email")) return "メールアドレスの形式を確認してください。";
  if (code.includes("operation-not-allowed")) return "FirebaseのAuthenticationで「メール／パスワード」を有効にしてください。";
  if (code.includes("too-many-requests")) return "試行回数が多すぎます。少し待ってからもう一度試してください。";
  return "処理に失敗しました。Firebaseの設定と通信状態を確認してください。";
}

function userDocRef(uid) {
  return doc(db, "users", uid, "study", "main");
}

function localPayload() {
  return {
    stats: getStats(),
    mistakes: getMistakes(),
    updatedAt: serverTimestamp(),
    version: 1
  };
}

async function loadCloudData(user) {
  cloudLoaded = false;
  syncStatus.textContent = "クラウド記録を読み込んでいます…";
  syncStatus.className = "sync-saving";
  try {
    const ref = userDocRef(user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      localStorage.setItem(statsKey, JSON.stringify(data.stats || {answered:0, correct:0}));
      localStorage.setItem(mistakesKey, JSON.stringify(data.mistakes || {}));
    } else {
      await setDoc(ref, localPayload(), {merge:true});
    }
    cloudLoaded = true;
    updateStatsUI();
    syncStatus.textContent = "学習記録は自動保存されています。";
    syncStatus.className = "sync-ok";
  } catch (error) {
    console.error(error);
    syncStatus.textContent = "同期できません。Firestore作成・セキュリティルールを確認してください。";
    syncStatus.className = "sync-error";
  }
}

async function saveCloudData() {
  if (!currentUser || !cloudLoaded) return;
  syncStatus.textContent = "保存中…";
  syncStatus.className = "sync-saving";
  try {
    await setDoc(userDocRef(currentUser.uid), localPayload(), {merge:true});
    syncStatus.textContent = "保存しました。別端末にも同期されます。";
    syncStatus.className = "sync-ok";
  } catch (error) {
    console.error(error);
    syncStatus.textContent = "保存に失敗しました。通信とFirestoreルールを確認してください。";
    syncStatus.className = "sync-error";
  }
}

function scheduleCloudSave() {
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(saveCloudData, 500);
}

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
  const requestCloudSave = () => scheduleCloudSave();
  const saveMistake = (id, isCorrect) => {
    const m = getMistakes();
    if (isCorrect) {
      if (m[id]) m[id] = Math.max(0, m[id] - 1);
      if (m[id] === 0) delete m[id];
    } else m[id] = (m[id] || 0) + 1;
    localStorage.setItem(mistakesKey, JSON.stringify(m));
    requestCloudSave();
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
      clearCanvas(); $("#showAnswerBtn").classList.remove("hidden"); $("#checkBtn").classList.add("hidden");
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
    localStorage.setItem(statsKey, JSON.stringify(s)); saveMistake(q.id, correct); requestCloudSave();
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

  // Canvas
  const canvas = $("#writeCanvas"), ctx = canvas.getContext("2d");
  let drawing=false, paths=[], current=[];
  const resizeCanvas = () => {
    const rect = canvas.getBoundingClientRect(), ratio = devicePixelRatio || 1;
    canvas.width = rect.width * ratio; canvas.height = rect.height * ratio;
    ctx.setTransform(ratio,0,0,ratio,0,0); redraw();
  };
  const point = e => {
    const r=canvas.getBoundingClientRect(), p=e.touches?e.touches[0]:e;
    return {x:p.clientX-r.left,y:p.clientY-r.top};
  };
  const redraw = () => {
    ctx.clearRect(0,0,canvas.width,canvas.height); ctx.lineWidth=4; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.strokeStyle="#183247";
    paths.forEach(path => { if(path.length<2)return; ctx.beginPath(); ctx.moveTo(path[0].x,path[0].y); path.slice(1).forEach(p=>ctx.lineTo(p.x,p.y)); ctx.stroke(); });
  };
  const startDraw=e=>{e.preventDefault();drawing=true;current=[point(e)];paths.push(current)};
  const moveDraw=e=>{if(!drawing)return;e.preventDefault();current.push(point(e));redraw()};
  const endDraw=e=>{if(!drawing)return;e.preventDefault();drawing=false};
  const clearCanvas=()=>{paths=[];current=[];redraw()};
  ["pointerdown","touchstart"].forEach(ev=>canvas.addEventListener(ev,startDraw,{passive:false}));
  ["pointermove","touchmove"].forEach(ev=>canvas.addEventListener(ev,moveDraw,{passive:false}));
  ["pointerup","pointercancel","touchend"].forEach(ev=>canvas.addEventListener(ev,endDraw,{passive:false}));
  window.addEventListener("resize", resizeCanvas);
  $("#clearCanvasBtn").onclick=clearCanvas;
  $("#undoCanvasBtn").onclick=()=>{paths.pop();redraw()};

  $$(".count-btn").forEach(b => b.onclick = () => {
    $$(".count-btn").forEach(x => x.classList.remove("active")); b.classList.add("active"); state.count=+b.dataset.count;
  });
  $$(".mode-card").forEach(b => b.onclick = () => startQuiz(b.dataset.mode));
  $("#checkBtn").onclick = () => reveal(false);
  $("#showAnswerBtn").onclick = () => reveal(true);
  $("#nextBtn").onclick = next;
  $("#selfCorrectBtn").onclick = () => { const q=state.queue[state.index]; finishMark(true,q,"手書き自己採点：○"); next(); };
  $("#selfWrongBtn").onclick = () => { const q=state.queue[state.index]; finishMark(false,q,"手書き自己採点：×"); next(); };
  $("#backHomeBtn").onclick = () => { if(confirm("クイズを終了してホームに戻りますか？")) {updateStatsUI();showView("#homeView")} };
  $("#resultHomeBtn").onclick = () => {updateStatsUI();showView("#homeView")};
  $("#retryBtn").onclick = () => startQuiz(state.lastSettings.mode);



document.querySelector("#loginBtn").addEventListener("click", async () => {
  setAuthMessage("");
  try {
    await signInWithEmailAndPassword(auth, authEmail.value.trim(), authPassword.value);
  } catch (error) {
    setAuthMessage(friendlyAuthError(error));
  }
});

document.querySelector("#signupBtn").addEventListener("click", async () => {
  setAuthMessage("");
  if (!authEmail.value.trim() || authPassword.value.length < 6) {
    setAuthMessage("メールアドレスと6文字以上のパスワードを入力してください。");
    return;
  }
  try {
    await createUserWithEmailAndPassword(auth, authEmail.value.trim(), authPassword.value);
    setAuthMessage("アカウントを作成しました。", true);
  } catch (error) {
    setAuthMessage(friendlyAuthError(error));
  }
});

document.querySelector("#resetPasswordBtn").addEventListener("click", async () => {
  const email = authEmail.value.trim();
  if (!email) {
    setAuthMessage("先にメールアドレスを入力してください。");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    setAuthMessage("パスワード再設定メールを送りました。", true);
  } catch (error) {
    setAuthMessage(friendlyAuthError(error));
  }
});

document.querySelector("#logoutBtn").addEventListener("click", async () => {
  await saveCloudData();
  await signOut(auth);
});

authPassword.addEventListener("keydown", e => {
  if (e.key === "Enter") document.querySelector("#loginBtn").click();
});

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) {
    document.body.classList.remove("auth-loading");
    authGate.classList.add("hidden");
    document.querySelector("#userArea").classList.remove("hidden");
    document.querySelector("#userEmail").textContent = user.email || "ログイン中";
    await loadCloudData(user);
    updateStatsUI();
    setTimeout(resizeCanvas, 100);
  } else {
    cloudLoaded = false;
    document.body.classList.add("auth-loading");
    authGate.classList.remove("hidden");
    document.querySelector("#userArea").classList.add("hidden");
  }
});

})();
