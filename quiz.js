// quiz.js — the whole app (index.html), three screens:
//   1. select : tick the courses to be tested (at least 1), press 開始測驗
//   2. quiz   : 10 random multiple-choice questions, spread evenly over the ticked courses
//   3. result : your mark as "x / 10", then every question reviewed
// Marking: 1 mark per correct answer; wrong or unanswered = 0.
const QUIZ_SIZE = 10;
const COURSE_KEY = 'qna-courses';     // localStorage: ticked course ids
const STATE_KEY = 'qna-quiz';         // sessionStorage: quiz in progress / just finished
const LETTERS = ['A', 'B', 'C', 'D'];
const app = document.getElementById('app');

// ---------- helpers ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const courseById = id => COURSES.find(c => c.id === id);
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function read(storage, key, fallback) { try { const v = JSON.parse(storage.getItem(key)); return v ?? fallback; } catch (e) { return fallback; } }
function write(storage, key, value) { try { storage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ } }
const getCourses = () => read(localStorage, COURSE_KEY, []).filter(courseById);
const loadState = () => read(sessionStorage, STATE_KEY, null);
const saveState = s => write(sessionStorage, STATE_KEY, s);
const clearState = () => { try { sessionStorage.removeItem(STATE_KEY); } catch (e) {} };

// ---------- building a quiz ----------
// Take questions round-robin from the ticked courses (in random order), so the 10 questions are
// spread as evenly as possible: 1 course -> 10, 3 courses -> 4+3+3, 17 courses -> 1 each from 10 of them.
function draw(courseIds) {
  const buckets = shuffle(courseIds).map(id => shuffle(courseById(id).questions.map((_, i) => ({ cid: id, i }))));
  const picked = [];
  while (picked.length < QUIZ_SIZE && buckets.some(b => b.length)) {
    for (const b of buckets) if (picked.length < QUIZ_SIZE && b.length) picked.push(b.pop());
  }
  return shuffle(picked);
}

// 3 wrong options for a question: its own wrong ones, plus (at most 1) a borrowed one, preferring
// whatever is closest in length to the correct option, so the right answer is not simply the longest.
// Borrowed candidates: wrong options of questions from OTHER topics of the same course, and (unless
// the question is flagged `solo`) the correct answer of another question in the same topic.
function buildItem({ cid, i }) {
  const course = courseById(cid), k = course.questions[i];
  const [correct, ...own] = k.o;
  const borrow = [];
  course.questions.forEach((x, j) => {
    if (j === i) return;
    if (x.topic !== k.topic) borrow.push(...x.o.slice(1));          // other topic: only its wrong options
    else if (!k.solo && !x.solo) borrow.push(x.o[0]);               // same topic: its correct answer
  });
  const ranked = [...own.map(s => ({ s, b: false })), ...borrow.map(s => ({ s, b: true }))]
    .map(o => ({ ...o, d: Math.abs(o.s.length - correct.length) + Math.random() * 0.5 }))
    .sort((x, y) => x.d - y.d);
  const wrong = []; let borrowed = 0;
  for (const o of ranked) {
    if (wrong.length === 3) break;
    if (o.s === correct || wrong.includes(o.s)) continue;
    if (o.b && borrowed >= 1) continue;
    if (o.b) borrowed++;
    wrong.push(o.s);
  }
  const choices = shuffle([correct, ...wrong]);
  return { cid, i, choices, correct: choices.indexOf(correct) };
}

function newQuiz(courseIds) {
  const items = draw(courseIds).map(buildItem);
  const state = { stage: 'quiz', courses: courseIds, items, answers: items.map(() => null) };
  saveState(state);
  return state;
}

// ---------- 1. select courses ----------
function renderSelect() {
  const picked = new Set(getCourses());
  app.innerHTML = `
    <ol class="steps">
      <li>勾選想測驗的課程（最少 1 個）</li>
      <li>按「開始測驗」，系統由所選課程平均抽出 ${QUIZ_SIZE} 題</li>
      <li>作答後按「提交」，即時顯示分數</li>
    </ol>
    <div class="picklist">
      ${COURSES.map(c => `
        <label class="pick ${picked.has(c.id) ? 'selected' : ''}">
          <input type="checkbox" value="${c.id}" ${picked.has(c.id) ? 'checked' : ''}>
          <span>${esc(c.title)}</span>
        </label>`).join('')}
    </div>
    <div class="startbar"><span id="info"></span><button id="start" class="big">開始測驗</button></div>`;

  const boxes = [...app.querySelectorAll('input[type=checkbox]')];
  const refresh = () => {
    const ids = boxes.filter(b => b.checked).map(b => b.value);
    boxes.forEach(b => b.closest('.pick').classList.toggle('selected', b.checked));
    write(localStorage, COURSE_KEY, ids);
    document.getElementById('info').textContent = ids.length ? `已選 ${ids.length} 個課程` : '請先勾選至少 1 個課程';
    document.getElementById('start').disabled = ids.length === 0;
  };
  boxes.forEach(b => b.addEventListener('change', refresh));
  document.getElementById('start').onclick = () => {
    const ids = boxes.filter(b => b.checked).map(b => b.value);
    if (ids.length) { newQuiz(ids); render(); window.scrollTo(0, 0); }
  };
  refresh();
}

// ---------- 2. quiz ----------
function renderQuiz(state) {
  app.innerHTML = `
    <div class="quizbar"><strong>測驗進行中</strong><span id="progress"></span></div>
    <form id="qform" onsubmit="return false">
      ${state.items.map((it, n) => {
        const c = courseById(it.cid), k = c.questions[it.i];
        return `
        <fieldset class="qcard">
          <legend><span class="qn">${n + 1}</span></legend>
          <p class="tag">${esc(c.title)} · ${esc(k.topic)}</p>
          <p class="qtext">${esc(k.q)}</p>
          ${it.choices.map((text, j) => `
            <label class="opt">
              <input type="radio" name="q${n}" value="${j}" ${state.answers[n] === j ? 'checked' : ''}>
              <span class="ol">${LETTERS[j]}</span><span>${esc(text)}</span>
            </label>`).join('')}
        </fieldset>`;
      }).join('')}
      <p class="center">
        <button id="submit" class="big">提交</button>
        <button id="back" class="ghost" type="button">返回選擇課程</button>
      </p>
    </form>`;

  const paint = () => { document.getElementById('progress').textContent = `已作答 ${state.answers.filter(a => a !== null).length} / ${state.items.length}`; };
  app.querySelectorAll('input[type=radio]').forEach(r => r.addEventListener('change', () => {
    state.answers[Number(r.name.slice(1))] = Number(r.value);
    saveState(state); paint();
  }));
  paint();
  document.getElementById('submit').onclick = () => { state.stage = 'result'; saveState(state); render(); window.scrollTo(0, 0); };
  document.getElementById('back').onclick = () => { clearState(); render(); window.scrollTo(0, 0); };
}

// ---------- 3. result ----------
function renderResult(state) {
  const marks = state.items.filter((it, n) => state.answers[n] === it.correct).length;
  app.innerHTML = `
    <div class="score"><div class="big-num">${marks}<small> / ${state.items.length}</small></div></div>
    <p class="center">
      <button id="again" class="big">再測一次</button>
      <button id="change" class="ghost">重新選擇課程</button>
    </p>
    <h2>逐題檢視</h2>
    ${state.items.map((it, n) => {
      const c = courseById(it.cid), k = c.questions[it.i], mine = state.answers[n], ok = mine === it.correct;
      return `
      <section class="qcard review ${ok ? 'ok' : 'bad'}">
        <p class="tag">${ok ? '✅ 答對' : mine === null ? '⚪ 未作答' : '❌ 答錯'} · ${esc(c.title)} · ${esc(k.topic)}</p>
        <p class="qtext"><span class="qn">${n + 1}</span> ${esc(k.q)}</p>
        ${it.choices.map((text, j) => `
          <div class="opt ${j === it.correct ? 'right' : ''} ${j === mine && !ok ? 'wrong' : ''}">
            <span class="ol">${LETTERS[j]}</span><span>${esc(text)}</span>
            <span class="tags">${j === it.correct ? '<em>正確答案</em>' : ''}${j === mine ? '<em class="you">你的選擇</em>' : ''}</span>
          </div>`).join('')}
        <div class="ans"><span class="an">A</span><p>${esc(k.a)}</p></div>
      </section>`;
    }).join('')}`;
  document.getElementById('again').onclick = () => { newQuiz(state.courses.filter(courseById)); render(); window.scrollTo(0, 0); };
  document.getElementById('change').onclick = () => { clearState(); render(); window.scrollTo(0, 0); };
}

// ---------- router ----------
function render() {
  const s = loadState();
  const valid = s && Array.isArray(s.items) && s.items.length && s.items.every(it => courseById(it.cid) && courseById(it.cid).questions[it.i]);
  if (!valid) { clearState(); return renderSelect(); }
  return s.stage === 'result' ? renderResult(s) : renderQuiz(s);
}
render();
