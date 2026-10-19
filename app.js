/* Torty's Walk — a slow-and-steady tortoise step game. No build step, all local. */
(() => {
'use strict';
const KEY = 'shellySteps.v1';
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('en-US');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const MILESTONES = [0.25, 0.5, 0.75, 1];

// ---------- Rewards (unlocked by level) ----------
const REWARDS = {
  hat: [
    {id:'none', name:'No hat', lv:1},
    {id:'sprout', name:'Leaf sprout', lv:2},
    {id:'flowers', name:'Daisy crown', lv:4},
    {id:'sunhat', name:'Sun hat', lv:6},
    {id:'party', name:'Party hat', lv:9},
    {id:'beanie', name:'Cozy beanie', lv:12},
    {id:'crown', name:'Golden crown', lv:16},
  ],
  shell: [
    {id:'classic', name:'Classic', lv:1},
    {id:'polka', name:'Polka dots', lv:3},
    {id:'stripes', name:'Stripes', lv:5},
    {id:'hearts', name:'Hearts', lv:8},
    {id:'stars', name:'Starry', lv:11},
    {id:'rainbow', name:'Rainbow', lv:14},
  ],
  treat: [
    {id:'lettuce', name:'Lettuce', lv:1},
    {id:'strawberry', name:'Strawberry', lv:2},
    {id:'dandelion', name:'Dandelion', lv:4},
    {id:'clover', name:'Clover', lv:7},
    {id:'melon', name:'Watermelon', lv:10},
    {id:'hibiscus', name:'Hibiscus', lv:13},
  ],
  bg: [
    {id:'meadow', name:'Meadow', lv:1},
    {id:'pond', name:'Lily pond', lv:3},
    {id:'strawberry', name:'Berry patch', lv:6},
    {id:'sunset', name:'Sunset dunes', lv:10},
    {id:'night', name:'Starry night', lv:15},
  ],
};
const TAB_LABELS = {hat:'🎩 Hats', shell:'🐚 Shells', treat:'🍓 Treats', bg:'🌄 Places'};

// Level n needs 750*n*(n-1)/2 lifetime steps: 0, 750, 2250, 4500, 7500, ...
const levelStart = n => 750 * n * (n - 1) / 2;
const levelFor = total => { let n = 1; while (total >= levelStart(n + 1)) n++; return n; };

// ---------- State ----------
const fresh = () => ({
  goal: 10000, sensitivity: 1.2,
  today: {date: dayKey(), steps: 0, milestones: []},
  history: {},            // 'YYYY-MM-DD' -> {steps, goal}
  total: 0,
  equipped: {hat:'none', shell:'classic', treat:'lettuce', bg:'meadow'},
  seenLevel: 1,
});
let S;
try { S = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { S = fresh(); }
S.equipped = Object.assign(fresh().equipped, S.equipped || {});
let saveTimer = null;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => localStorage.setItem(KEY, JSON.stringify(S)), 250); };
const saveNow = () => { clearTimeout(saveTimer); localStorage.setItem(KEY, JSON.stringify(S)); };

function rollover() {
  const k = dayKey();
  if (S.today.date !== k) {
    S.history[S.today.date] = {steps: S.today.steps, goal: S.goal};
    S.today = {date: k, steps: 0, milestones: []};
    saveNow(); say(pick(MSG.morning)); render(true);
  }
}
function streak() {
  const met = k => k === S.today.date ? S.today.steps >= S.goal : (S.history[k] && S.history[k].steps >= S.history[k].goal);
  let n = 0; const d = new Date();
  if (!met(dayKey(d))) d.setDate(d.getDate() - 1); // today not done yet doesn't break streak
  while (met(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---------- Messages ----------
const pick = a => a[Math.floor(Math.random() * a.length)];
const MSG = {
  sleepy: ["*yawn* ...is it stroll o'clock? 🐢💤", "Slow and steady wins the race — but first we have to start it!", "Even the longest journey starts with one tiny tortoise step.", "I packed a lettuce leaf. Ready when you are!"],
  content: ["Look at us go! Steady as a shell. 🐢", "No rush — every step counts.", "Plod, plod, plod... I love this pace!", "The hare is napping. We're still going. 😌"],
  happy: ["My shell is practically glowing! ✨", "Past halfway — steady feet, happy heart!", "You're the tortoise of my dreams. Keep strolling!", "I can smell the strawberries at the finish line! 🍓"],
  ecstatic: ["WE DID IT! Slow and steady WON the race! 🏆", "Goal smashed! I'm doing a happy shell-wiggle!", "Best. Walk. Ever. You're a champion strider! 🌟"],
  walking: ["Ooh, we're moving! 🐾", "Step, step, step... lovely!", "Feel that breeze? Steady pace, friend!"],
  tap: ["Hehe, that tickles! 🐢", "*happy shell wiggle*", "Did you know tortoises can live over 100 years? Walking helps!", "Boop! Shall we take a few more steps?"],
  morning: ["New day, new stroll! I saved you a leaf. 🥬", "Good morning! Slow and steady today?"],
};
const MS_TEXT = {
  0.25: ['🌱', 'A quarter of the way!', "Our first leaf of the day! Slow and steady is already paying off."],
  0.5:  ['🍓', 'Halfway there!', "Strawberry break! You're doing shell-tastic — keep plodding."],
  0.75: ['🌼', 'Three quarters done!', "The finish line is in sight. The hare never stood a chance!"],
  1:    ['🏆', 'Daily goal reached!', "Slow and steady WON the race! Torty is over the moon."],
};

// ---------- Tortoise SVG ----------
const SHELL_PAT = {
  classic: `<path d="M84 118 L92 82 H130 L138 118 Z" fill="#f7d3a6"/><path d="M50 118 Q52 92 72 78 L84 118Z" fill="#f7d3a6" opacity=".8"/><path d="M172 118 Q170 92 150 78 L138 118Z" fill="#f7d3a6" opacity=".8"/><path d="M92 82 Q111 58 130 82Z" fill="#f7d3a6" opacity=".7"/>`,
  polka: [[70,100,9],[100,80,8],[130,95,10],[160,105,7],[95,110,6],[118,70,6],[150,80,6],[60,116,5]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#fff4e3"/>`).join(''),
  stripes: [0,1,2,3,4].map(i=>`<path d="M${44+i*30} 124 Q${52+i*30} 70 ${78+i*30} 52" stroke="#f9e0b8" stroke-width="9" fill="none"/>`).join(''),
  hearts: [[70,102,1],[104,80,1.2],[140,98,1.1],[118,112,.8],[160,112,.8]].map(([x,y,s])=>`<path transform="translate(${x} ${y}) scale(${s})" d="M0 4 C-10 -6 -4 -14 0 -8 C4 -14 10 -6 0 4Z" fill="#ff9fb6"/>`).join(''),
  stars: [[68,104,1],[100,80,1.3],[136,96,1.1],[160,112,.8],[112,114,.8],[124,68,.7]].map(([x,y,s])=>`<path transform="translate(${x} ${y}) scale(${s})" d="M0-9 2.6-3 9-2.8 4 1.4 5.6 8 0 4.4-5.6 8-4 1.4-9-2.8-2.6-3Z" fill="#fff3a6"/>`).join(''),
  rainbow: ['#ffb3b3','#ffd5a1','#fff1a1','#c4efb4','#b5dcff','#d6c6ff'].map((c,i)=>`<path d="M${40+i*10} 126 A${72-i*10} ${66-i*10} 0 0 1 ${184-i*10} 126" stroke="${c}" stroke-width="10" fill="none"/>`).join(''),
};
const SHELL_COL = {classic:'#f2b880', polka:'#f4a6a6', stripes:'#f2b880', hearts:'#ffd9e3', stars:'#a99ee0', rainbow:'#fff'};
const HATS = {
  none: '',
  sprout: `<path d="M192 66 v-12" stroke="#5aa865" stroke-width="3" stroke-linecap="round"/><path d="M192 56 q-14 -12 -18 2 q10 6 18 -2Z" fill="#7cc98a"/><path d="M192 54 q14 -14 20 0 q-10 8 -20 0Z" fill="#9bdc8f"/>`,
  flowers: [168,180,192,204,216].map((x,i)=>`<g transform="translate(${x} ${70 - (i===2?6:i%2?4:0)})"><circle r="6" fill="${['#fff','#ffd1dc','#fff','#ffd1dc','#fff'][i]}"/><circle r="2.5" fill="#ffcf6e"/></g>`).join(''),
  sunhat: `<ellipse cx="192" cy="70" rx="38" ry="8" fill="#f3d38c"/><path d="M174 70 Q176 46 192 46 Q208 46 210 70Z" fill="#f7dfa3"/><rect x="175" y="62" width="34" height="6" rx="3" fill="#ff9fb6"/><circle cx="208" cy="62" r="4" fill="#fff"/>`,
  party: `<path d="M178 72 L194 30 L210 72Z" fill="#b5dcff"/><path d="M183 60 L205 60 M188 48 L200 48" stroke="#ff9fb6" stroke-width="5"/><circle cx="194" cy="30" r="6" fill="#ffcf6e"/>`,
  beanie: `<path d="M166 76 Q166 44 192 44 Q218 44 218 76Z" fill="#c9b6f2"/><rect x="164" y="70" width="56" height="10" rx="5" fill="#a78fe0"/><circle cx="192" cy="42" r="7" fill="#fff"/>`,
  crown: `<path d="M172 72 L174 48 L184 60 L192 42 L200 60 L210 48 L212 72Z" fill="#ffcf4a" stroke="#e3a93a" stroke-width="2" stroke-linejoin="round"/><circle cx="192" cy="62" r="3.5" fill="#ff7c9c"/><circle cx="180" cy="66" r="2.5" fill="#7cc9ff"/><circle cx="204" cy="66" r="2.5" fill="#7cc9ff"/>`,
};
const TREATS = {
  lettuce: `<ellipse cx="0" cy="0" rx="14" ry="9" fill="#9bdc8f"/><ellipse cx="-4" cy="-3" rx="9" ry="6" fill="#c4efb4"/><path d="M-10 0 Q0 -4 10 2" stroke="#7cc98a" stroke-width="1.5" fill="none"/>`,
  strawberry: `<path d="M0 12 C-14 2 -12 -8 0 -6 C12 -8 14 2 0 12Z" fill="#ff7c8c"/><path d="M-7 -7 L0 -3 L7 -7 L3 -10 L0 -8 L-3 -10Z" fill="#7cc98a"/><circle cx="-4" cy="0" r="1" fill="#ffe7a3"/><circle cx="3" cy="3" r="1" fill="#ffe7a3"/><circle cx="1" cy="-2" r="1" fill="#ffe7a3"/>`,
  dandelion: `<path d="M0 12 V-2" stroke="#7cc98a" stroke-width="2.5"/>${[0,45,90,135,180,225,270,315].map(a=>`<ellipse transform="rotate(${a}) translate(0 -14)" cx="0" cy="6" rx="3" ry="6" fill="#ffd84a"/>`).join('')}<circle cx="0" cy="-8" r="4" fill="#ffb92e" transform="translate(0 8)"/>`,
  clover: `<g transform="translate(0 -2)">${[0,120,240].map(a=>`<circle transform="rotate(${a}) translate(0 -6)" r="6" fill="#7cc98a"/>`).join('')}<circle r="2" fill="#5aa865"/></g><path d="M0 4 Q2 10 6 12" stroke="#5aa865" stroke-width="2" fill="none"/>`,
  melon: `<path d="M-15 -2 A15 15 0 0 0 15 -2Z" fill="#7cc98a"/><path d="M-12 -2 A12 12 0 0 0 12 -2Z" fill="#ff8c9c"/><circle cx="-5" cy="2" r="1.2" fill="#4a3b35"/><circle cx="0" cy="5" r="1.2" fill="#4a3b35"/><circle cx="5" cy="2" r="1.2" fill="#4a3b35"/>`,
  hibiscus: `${[0,72,144,216,288].map(a=>`<ellipse transform="rotate(${a}) translate(0 -7)" rx="6" ry="8" fill="#ff9fb6"/>`).join('')}<circle r="3" fill="#ffcf6e"/>`,
};
function face(mood) {
  const ink = '#4a3b35';
  const eyes = {
    sleepy: `<path d="M178 90 q6 4 12 0 M198 90 q6 4 12 0" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    content: `<g class="blink"><circle cx="184" cy="89" r="4.5" fill="${ink}"/><circle cx="204" cy="89" r="4.5" fill="${ink}"/><circle cx="185.5" cy="87.5" r="1.4" fill="#fff"/><circle cx="205.5" cy="87.5" r="1.4" fill="#fff"/></g>`,
    happy: `<g class="blink"><circle cx="184" cy="88" r="6" fill="${ink}"/><circle cx="204" cy="88" r="6" fill="${ink}"/><circle cx="186" cy="86" r="2.2" fill="#fff"/><circle cx="206" cy="86" r="2.2" fill="#fff"/></g>`,
    ecstatic: `<path d="M178 91 l6 -6 l6 6 M198 91 l6 -6 l6 6" stroke="${ink}" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  }[mood];
  const mouth = {
    sleepy: `<ellipse cx="194" cy="104" rx="3" ry="2.5" fill="${ink}"/><text class="zzz" x="222" y="66" font-size="16" fill="#9a8a80" font-weight="700">z</text>`,
    content: `<path d="M188 102 q6 5 12 0" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    happy: `<path d="M186 101 q8 10 16 0 Z" fill="${ink}"/><path d="M190 105 q4 3 8 0" fill="#ff8c9c"/>`,
    ecstatic: `<path d="M184 100 q10 15 20 0 Z" fill="${ink}"/><path d="M188 106 q6 5 12 0" fill="#ff8c9c"/>`,
  }[mood];
  const blush = mood === 'sleepy' ? '' : `<ellipse cx="176" cy="99" rx="5" ry="3" fill="#ffaabb" opacity="${mood==='content'?.45:.75}"/><ellipse cx="212" cy="99" rx="5" ry="3" fill="#ffaabb" opacity="${mood==='content'?.45:.75}"/>`;
  return eyes + mouth + blush;
}
function petSVG(mood, eq) {
  const skin = '#a8dca6', skinD = '#8fcb8d', sc = SHELL_COL[eq.shell] || '#f2b880';
  const sparkles = mood === 'ecstatic' ? `<text x="20" y="60" font-size="18">✨</text><text x="214" y="40" font-size="16">✨</text>` : '';
  return `
  <defs><clipPath id="dome"><path d="M40 124 A72 66 0 0 1 184 124 Z"/></clipPath></defs>
  <ellipse cx="120" cy="166" rx="92" ry="9" fill="#00000014"/>
  <g transform="translate(232 150)">${TREATS[eq.treat] || ''}</g>
  <g class="bodywrap">
    <path d="M42 120 L22 128 L42 132Z" fill="${skinD}"/>
    <rect class="leg a" x="52" y="122" width="22" height="36" rx="11" fill="${skinD}"/>
    <rect class="leg b" x="150" y="122" width="22" height="36" rx="11" fill="${skinD}"/>
    <rect class="leg b" x="72" y="124" width="22" height="36" rx="11" fill="${skin}"/>
    <rect class="leg a" x="130" y="124" width="22" height="36" rx="11" fill="${skin}"/>
    <path d="M168 112 Q176 98 184 96 L196 112 Z" fill="${skin}"/>
    <circle cx="194" cy="94" r="30" fill="${skin}"/>
    <path d="M40 124 A72 66 0 0 1 184 124 Z" fill="${sc}"/>
    <g clip-path="url(#dome)">${SHELL_PAT[eq.shell] || ''}</g>
    <path d="M58 92 Q72 68 98 62" stroke="#ffffff80" stroke-width="6" fill="none" stroke-linecap="round"/>
    <rect x="34" y="116" width="156" height="16" rx="8" fill="#d99a63"/>
    ${face(mood)}
    ${HATS[eq.hat] || ''}
  </g>${sparkles}`;
}
function moodFor(p) { return p >= 1 ? 'ecstatic' : p >= 0.5 ? 'happy' : p >= 0.1 ? 'content' : 'sleepy'; }
function thumb(type, id) {
  if (type === 'hat') return `<svg viewBox="160 26 64 56">${HATS[id] || '<text x="180" y="66" font-size="22">🚫</text>'}</svg>`;
  if (type === 'treat') return `<svg viewBox="-18 -16 36 30">${TREATS[id]}</svg>`;
  if (type === 'shell') return `<svg viewBox="34 56 158 76"><clipPath id="t${id}"><path d="M40 124 A72 66 0 0 1 184 124 Z"/></clipPath><path d="M40 124 A72 66 0 0 1 184 124 Z" fill="${SHELL_COL[id]}"/><g clip-path="url(#t${id})">${SHELL_PAT[id]}</g><rect x="34" y="116" width="156" height="14" rx="7" fill="#d99a63"/></svg>`;
  return `<svg viewBox="0 0 44 36"><foreignObject width="44" height="36"><div xmlns="http://www.w3.org/1999/xhtml" class="bg-${id}" style="width:44px;height:36px;border-radius:8px"></div></foreignObject></svg>`;
}

// ---------- Rendering ----------
let tab = 'hat', lastMood = null, lastLevel = null;
function render(full) {
  const p = S.today.steps / S.goal, lv = levelFor(S.total), mood = moodFor(p);
  $('steps').textContent = fmt(S.today.steps);
  $('goalText').textContent = fmt(S.goal);
  $('pct').textContent = Math.floor(Math.min(p, 9.99) * 100) + '%';
  const C = 2 * Math.PI * 52, fg = $('ringFg');
  fg.style.strokeDasharray = C; fg.style.strokeDashoffset = C * (1 - Math.min(p, 1));
  fg.style.stroke = p >= 1 ? '#ffb347' : '#7cc98a';
  $('ringTicks').innerHTML = MILESTONES.slice(0, 3).map(m => { const a = m * 2 * Math.PI; return `<circle class="tick ${p >= m ? 'done' : ''}" cx="${60 + 52 * Math.cos(a)}" cy="${60 + 52 * Math.sin(a)}" r="5"/>`; }).join('');
  $('milestones').innerHTML = MILESTONES.map(m => `<div class="ms ${p >= m ? 'done' : ''}"><b>${MS_TEXT[m][0]}</b>${fmt(S.goal * m)}</div>`).join('');
  $('level').textContent = lv; $('streak').textContent = streak();
  const a = levelStart(lv), b = levelStart(lv + 1);
  $('xpFill').style.width = ((S.total - a) / (b - a) * 100) + '%';
  $('xpText').textContent = `${fmt(S.total - a)} / ${fmt(b - a)} steps to level ${lv + 1}`;
  if (mood !== lastMood || full) { $('pet').innerHTML = petSVG(mood, S.equipped); $('pet').dataset.mood = mood; }
  $('stage').className = 'stage bg-' + S.equipped.bg;
  if (lv !== lastLevel || full) { renderWardrobe(lv); renderWeek(); }
  else if (full !== false) renderWeek();
  lastMood = mood; lastLevel = lv;
}
function renderWardrobe(lv) {
  $('tabs').innerHTML = Object.keys(REWARDS).map(t => `<button class="tab ${t === tab ? 'sel' : ''}" data-tab="${t}">${TAB_LABELS[t]}</button>`).join('');
  $('grid').innerHTML = REWARDS[tab].map(r => { const locked = lv < r.lv, sel = S.equipped[tab] === r.id;
    return `<button class="item ${locked ? 'locked' : ''} ${sel ? 'sel' : ''}" data-id="${r.id}" ${locked ? 'aria-disabled="true"' : ''}>${thumb(tab, r.id)}<span>${r.name}</span>${locked ? `<span class="lk">🔒 Lv ${r.lv}</span>` : ''}</button>`; }).join('');
  const next = Object.entries(REWARDS).flatMap(([t, rs]) => rs.map(r => ({...r, t}))).filter(r => r.lv > lv).sort((x, y) => x.lv - y.lv)[0];
  $('nextUnlock').textContent = next ? `Next unlock: ${next.name} at level ${next.lv} (${fmt(levelStart(next.lv) - S.total)} more steps)` : 'You unlocked everything! Torty is the best-dressed tortoise in town. 👑';
}
function renderWeek() {
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = dayKey(d);
    const rec = k === S.today.date ? {steps: S.today.steps, goal: S.goal} : (S.history[k] || {steps: 0, goal: S.goal});
    days.push({k, d, ...rec, today: i === 0}); }
  const max = Math.max(S.goal, ...days.map(d => d.steps));
  $('week').innerHTML = days.map(d => `<div class="day ${d.today ? 'today' : ''}" title="${fmt(d.steps)} steps"><div class="bar ${d.steps >= d.goal ? 'met' : ''}" style="height:${d.steps / max * 90}%"></div><span class="lbl">${d.today ? 'Today' : d.d.toLocaleDateString('en-US', {weekday: 'short'})}</span></div>`).join('');
  const wk = days.reduce((s, d) => s + d.steps, 0);
  $('totals').textContent = `${fmt(wk)} steps this week · ${fmt(S.total)} lifetime (~${(S.total * 0.000762).toFixed(1)} km)`;
}

// ---------- UI feedback ----------
let bubbleLock = 0;
function say(t, hold = 0) { $('bubble').textContent = t; bubbleLock = Date.now() + hold; }
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600); }
function confetti(big) {
  const box = $('confetti'), bits = ['🍃','🌸','🍓','⭐','🥬','💚','✨','🌼'];
  for (let i = 0; i < (big ? 60 : 28); i++) { const s = document.createElement('span'); s.textContent = pick(bits);
    s.style.left = Math.random() * 100 + 'vw'; s.style.animationDuration = 1.8 + Math.random() * 2 + 's'; s.style.animationDelay = Math.random() * .6 + 's'; s.style.fontSize = 14 + Math.random() * 18 + 'px';
    box.appendChild(s); setTimeout(() => s.remove(), 4800); }
}
const queue = [];
function celebrate(emoji, title, text, big) { queue.push([emoji, title, text, big]); if (!$('celebrate').classList.contains('show')) nextCelebration(); }
function nextCelebration() {
  const c = queue.shift(); if (!c) { $('celebrate').classList.remove('show'); return; }
  $('cEmoji').textContent = c[0]; $('cTitle').textContent = c[1]; $('cText').textContent = c[2];
  $('celebrate').classList.add('show'); confetti(c[3]); bounce();
  if (navigator.vibrate) try { navigator.vibrate([60, 40, 60]); } catch {}
}
$('cClose').onclick = nextCelebration;
function bounce() { const p = $('pet'); p.classList.remove('bounce'); void p.offsetWidth; p.classList.add('bounce'); }
let walkTimer;
function walkingAnim() { $('pet').classList.add('walking'); clearTimeout(walkTimer); walkTimer = setTimeout(() => $('pet').classList.remove('walking'), 1500); }

// ---------- Steps ----------
let lastMsgAt = 0;
function addSteps(n) {
  rollover();
  const before = S.today.steps / S.goal, lvBefore = levelFor(S.total);
  S.today.steps += n; S.total += n;
  const after = S.today.steps / S.goal, lvAfter = levelFor(S.total);
  for (const m of MILESTONES) if (before < m && after >= m && !S.today.milestones.includes(m)) {
    S.today.milestones.push(m); const [e, t, x] = MS_TEXT[m];
    celebrate(e, t, `${fmt(S.goal * m)} steps! ${x}`, m === 1);
  }
  if (lvAfter > lvBefore) {
    const unlocked = Object.entries(REWARDS).flatMap(([t, rs]) => rs.filter(r => r.lv > lvBefore && r.lv <= lvAfter).map(r => r.name));
    celebrate('🐢', `Level ${lvAfter}!`, unlocked.length ? `Torty unlocked: ${unlocked.join(', ')}. Check the wardrobe!` : 'Torty is growing stronger with every step. Slow and steady!', false);
  }
  walkingAnim(); save(); render(false);
  if (Date.now() > bubbleLock && Date.now() - lastMsgAt > 9000) { lastMsgAt = Date.now(); say(pick(Math.random() < .35 ? MSG.walking : MSG[moodFor(after)])); }
}

// Simple pedometer: low-pass the acceleration magnitude, remove gravity with a slow
// moving average, then count a step on each peak above a threshold, at least 250 ms apart.
const det = {lp: null, grav: null, above: false, peak: 0, lastStep: 0};
function detect(ax, ay, az, t) {
  const mag = Math.sqrt(ax * ax + ay * ay + az * az);
  det.lp = det.lp == null ? mag : det.lp + 0.25 * (mag - det.lp);       // low-pass (smooth jitter)
  det.grav = det.grav == null ? mag : det.grav + 0.02 * (mag - det.grav); // very slow baseline (~gravity)
  const sig = det.lp - det.grav, th = S.sensitivity;
  if (!det.above && sig > th) { det.above = true; det.peak = sig; }
  else if (det.above) {
    det.peak = Math.max(det.peak, sig);
    if (sig < th * 0.4) { // fell back down → that was a peak
      det.above = false;
      if (t - det.lastStep >= 250) { det.lastStep = t; return true; } // min 250 ms between steps
    }
  }
  return false;
}
let pending = 0, flushTimer = null;
function onStepDetected() { pending++; if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; const n = pending; pending = 0; addSteps(n); }, 120); }
function onMotion(e) {
  const a = e.accelerationIncludingGravity || e.acceleration; if (!a || a.x == null) return;
  if (detect(a.x, a.y, a.z, performance.now())) onStepDetected();
}

let walking = false, wakeLock = null;
async function keepAwake() { try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { rollover(); if (walking) keepAwake(); } });
$('startBtn').onclick = async () => {
  if (walking) { walking = false; window.removeEventListener('devicemotion', onMotion); try { wakeLock && wakeLock.release(); } catch {}
    $('startBtn').textContent = '👟 Start walking'; $('startBtn').classList.remove('on'); $('status').textContent = 'Paused. Torty is resting their feet. 🐢'; saveNow(); return; }
  if (!('DeviceMotionEvent' in window)) { $('status').textContent = "This device/browser doesn't have a motion sensor. Try Demo mode!"; return; }
  if (!window.isSecureContext) { $('status').textContent = 'Motion sensors need an https:// link. Open the secure link on your phone.'; }
  try {
    if (typeof DeviceMotionEvent.requestPermission === 'function') { // iOS 13+
      const r = await DeviceMotionEvent.requestPermission();
      if (r !== 'granted') { $('status').textContent = 'Motion access was denied. On iPhone: reload and tap Allow (or check Settings › Safari › Motion & Orientation).'; return; }
    }
  } catch (err) { $('status').textContent = 'Could not get motion permission: ' + err.message; return; }
  walking = true; window.addEventListener('devicemotion', onMotion); keepAwake();
  $('startBtn').textContent = '⏸ Pause'; $('startBtn').classList.add('on');
  $('status').innerHTML = 'Counting steps! Keep this page open and your phone in hand or pocket. 🐾';
  say(pick(MSG.walking), 4000);
  let got = false; const probe = () => { got = true; window.removeEventListener('devicemotion', probe); }; window.addEventListener('devicemotion', probe);
  setTimeout(() => { if (walking && !got) $('status').textContent = "No motion data yet — this device may not have a motion sensor (desktop?). Try Demo mode!"; }, 2500);
};

// Demo mode: feeds a synthetic walking accelerometer signal through the SAME detector,
// on a sped-up virtual clock (about 16 steps per real second), so you can test on desktop.
let demo = null, vt = 0;
$('demoBtn').onclick = () => {
  if (demo) { clearInterval(demo); demo = null; $('demoBtn').textContent = '🎮 Demo mode'; $('demoBtn').classList.remove('on'); $('status').textContent = 'Demo paused.'; saveNow(); return; }
  $('demoBtn').textContent = '⏹ Stop demo'; $('demoBtn').classList.add('on');
  $('status').textContent = 'Demo mode: simulating a brisk walk (sped up 8×). Demo steps count like real ones.';
  say("Wheee, practice stroll! Even pretend steps are steady steps. 🐢", 3000);
  vt = performance.now();
  demo = setInterval(() => {
    for (let i = 0; i < 8; i++) { // 8 virtual samples per tick, 16.7ms each, ~2 steps/s at a virtual 8× speed
      for (let k = 0; k < 8; k++) { vt += 1000 / 60; const ph = vt / 1000 * 2 * Math.PI * 2; // 2 Hz cadence
        const z = 9.81 + 3.2 * Math.max(0, Math.sin(ph)) ** 2 - 1.0 + (Math.random() - .5) * .6;
        if (detect((Math.random() - .5) * .8, (Math.random() - .5) * .8, z, vt)) onStepDetected(); }
    }
  }, 1000 / 15);
};

// ---------- Wardrobe, pet, settings ----------
$('tabs').onclick = e => { const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; renderWardrobe(levelFor(S.total)); } };
$('grid').onclick = e => { const it = e.target.closest('.item'); if (!it) return; const r = REWARDS[tab].find(x => x.id === it.dataset.id);
  if (levelFor(S.total) < r.lv) { toast(`🔒 ${r.name} unlocks at level ${r.lv}. Keep strolling!`); return; }
  S.equipped[tab] = r.id; saveNow(); render(true); bounce(); toast(`Torty ${tab === 'bg' ? 'moved to' : tab === 'treat' ? 'is munching' : 'is wearing'} ${r.name}! 💚`); };
$('pet').onclick = () => { bounce(); say(pick(MSG.tap), 3000); };
$('goalInput').value = S.goal; $('sens').value = S.sensitivity;
$('saveGoal').onclick = () => { const g = Math.round(+$('goalInput').value / 100) * 100;
  if (!(g >= 1000 && g <= 50000)) { toast('Pick a goal between 1,000 and 50,000 steps.'); return; }
  S.goal = g; S.today.milestones = MILESTONES.filter(m => S.today.steps / g >= m); saveNow(); render(true); toast(`New daily goal: ${fmt(g)} steps. Slow and steady! 🐢`); };
$('sens').oninput = () => { S.sensitivity = +$('sens').value; save(); };
$('resetBtn').onclick = () => { if (confirm('Reset all steps, history, and unlocks?')) { localStorage.removeItem(KEY); S = fresh(); $('goalInput').value = S.goal; render(true); say(pick(MSG.sleepy)); } };
$('sens').title = 'Lower = more sensitive';

// ---------- Boot ----------
rollover(); render(true); say(pick(MSG[moodFor(S.today.steps / S.goal)]));
setInterval(rollover, 30000); // catch local midnight while open
window.addEventListener('pagehide', saveNow);
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__shelly = {state: () => S, addSteps, levelFor}; // handy for testing
})();
