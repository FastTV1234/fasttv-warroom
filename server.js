const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// ── Default data ──────────────────────────────────────────────────────────────
const DEFAULT_DATA = {
  tasks: [
    { id:1, text:'Check DramaBox & ReelShort Meta Ad Library — count new active ads', owner:'Priya', due:'today', done:false },
    { id:2, text:'Screenshot top 3 recurring Kuku TV YouTube pre-roll creatives', owner:'Arjun', due:'today', done:false },
    { id:3, text:'Research JioHotstar Sparks pilot — confirm launch date', owner:'Rahul', due:'this-week', done:false },
    { id:4, text:'Greenlight decision: Bhojpuri romance series (Episode 1 script received)', owner:'Me', due:'today', done:false },
    { id:5, text:'Map ReelSaga genre library — identify uncovered tropes', owner:'Priya', due:'this-week', done:false },
    { id:6, text:'Track Kuku TV Hindi show launch count this week', owner:'Arjun', due:'this-week', done:false }
  ],
  pipeline: {
    'Ideation': [
      { title:'Revenge Bahu', genre:'Crime / Revenge', lang:'Hindi', priority:'High', logline:'Daughter-in-law discovers family secret and reclaims what is hers.' },
      { title:'Startup Queen', genre:'Workplace thriller', lang:'Hindi', priority:'Medium', logline:'Small-town girl disrupts Mumbai startup funded by the man who wronged her family.' }
    ],
    'Greenlit': [
      { title:'Kuch Ankahi Baatein', genre:'Romance / CEO', lang:'Marathi', priority:'High', logline:'Billionaire falls for the one woman not impressed by his wealth.' }
    ],
    'In Production': [
      { title:'Dil Ka Badla', genre:'Romance / CEO', lang:'Hindi', priority:'High', logline:'She fakes amnesia to escape a forced marriage — and falls for her captor.' }
    ],
    'Post Production': [],
    'Launched': [
      { title:'Raat Ka Raaz', genre:'Supernatural', lang:'Hindi', priority:'Medium', logline:'Night watchman discovers the building hides a 40-year-old secret.' }
    ]
  },
  launches: [
    { id:1, title:'CEO Ka Raaz', platform:'DramaBox', genre:'Romance / CEO', lang:'Hindi', eps:72, promo:'Heavy', source:'Meta Ads', hook:'He married me but never looked at me. Then he saw who I really was...', notes:'Identity reveal cliffhanger every 3 eps. 18 active ad creatives.', logger:'Priya', date:'2026-03-18' },
    { id:2, title:'Badla Mera Haq', platform:'DramaBox', genre:'Crime / Revenge', lang:'Hindi', eps:65, promo:'Heavy', source:'Meta Ads', hook:'You humiliated me in front of everyone. Now watch who I become.', notes:'Revenge arc. Opens with public humiliation scene. Strong female lead.', logger:'Arjun', date:'2026-03-17' },
    { id:3, title:'Anari Pati', platform:'Kuku TV', genre:'Romance / CEO', lang:'Hindi', eps:80, promo:'Moderate', source:'YouTube Ads', hook:'He acted useless but ran the whole empire from the shadows.', notes:'Hidden identity trope. Husband appears weak, actually billionaire.', logger:'Rahul', date:'2026-03-15' },
    { id:4, title:'Married the Enemy', platform:'ReelShort', genre:'Romance / CEO', lang:'Hindi', eps:60, promo:'Heavy', source:'Meta Ads', hook:"I thought he was my enemy. Turns out he was protecting me all along.", notes:'16 creatives running. Opening: wedding day voiceover.', logger:'Priya', date:'2026-03-14' },
    { id:5, title:'Daksh IAS', platform:'Kuku TV', genre:'Workplace thriller', lang:'Hindi', eps:90, promo:'Moderate', source:'YouTube Channel', hook:'From chai seller to IAS topper. The system never saw him coming.', notes:'Aspirational underdog arc. Strong Tier-2 resonance.', logger:'Arjun', date:'2026-03-12' },
    { id:6, title:'Pyaar Dhoka Pyaar', platform:'QuickTV', genre:'Romance / CEO', lang:'Hindi', eps:55, promo:'Organic', source:'Instagram Reel', hook:'She loved him with everything. He used her for one reason.', notes:'Betrayal-first structure. High engagement from women 20–30.', logger:'Me', date:'2026-03-10' },
    { id:7, title:'Revenge Bride', platform:'GoodShort', genre:'Crime / Revenge', lang:'Hindi', eps:68, promo:'Heavy', source:'Meta Ads', hook:"At the altar she smiled. Nobody knew what she had planned.", notes:'10 creatives. Wedding-day cold open.', logger:'Priya', date:'2026-03-08' },
    { id:8, title:'Alpha CEO', platform:'ReelShort', genre:'Romance / CEO', lang:'Hindi', eps:75, promo:'Heavy', source:'Meta Ads', hook:'He never smiled at anyone. Until she walked into his boardroom.', notes:'13 creatives. Brooding male lead archetype.', logger:'Rahul', date:'2026-03-06' }
  ],
  idCounters: { tasks: 7, launches: 9 }
};

// ── Persistence ───────────────────────────────────────────────────────────────
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) { console.error('Load error:', e.message); }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function saveData(data) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
  catch (e) { console.error('Save error:', e.message); }
}

let db = loadData();

// ── WebSocket broadcast ───────────────────────────────────────────────────────
function broadcast(type, payload, skip) {
  const msg = JSON.stringify({ type, payload });
  wss.clients.forEach(c => {
    if (c !== skip && c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

wss.on('connection', ws => {
  // Send full state on connect
  ws.send(JSON.stringify({ type: 'INIT', payload: db }));

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { type, payload } = msg;

    switch (type) {

      // ── TASKS ──
      case 'ADD_TASK': {
        const task = { ...payload, id: db.idCounters.tasks++ };
        db.tasks.unshift(task);
        saveData(db);
        broadcast('ADD_TASK', task, ws);
        ws.send(JSON.stringify({ type: 'TASK_ID', payload: { tempId: payload.id, realId: task.id } }));
        break;
      }
      case 'TOGGLE_TASK': {
        const t = db.tasks.find(x => x.id === payload.id);
        if (t) { t.done = !t.done; saveData(db); broadcast('TOGGLE_TASK', { id: t.id, done: t.done }, ws); }
        break;
      }

      // ── PIPELINE ──
      case 'MOVE_CARD': {
        const { fromStage, toStage, idx } = payload;
        if (!db.pipeline[fromStage] || idx < 0 || idx >= db.pipeline[fromStage].length) break;
        const [card] = db.pipeline[fromStage].splice(idx, 1);
        db.pipeline[toStage] = db.pipeline[toStage] || [];
        db.pipeline[toStage].push(card);
        saveData(db);
        broadcast('PIPELINE_UPDATE', db.pipeline, ws);
        ws.send(JSON.stringify({ type: 'PIPELINE_UPDATE', payload: db.pipeline }));
        break;
      }
      case 'ADD_CARD': {
        const { stage, card } = payload;
        db.pipeline[stage] = db.pipeline[stage] || [];
        db.pipeline[stage].push(card);
        saveData(db);
        broadcast('PIPELINE_UPDATE', db.pipeline, ws);
        ws.send(JSON.stringify({ type: 'PIPELINE_UPDATE', payload: db.pipeline }));
        break;
      }

      // ── LAUNCHES ──
      case 'ADD_LAUNCH': {
        const launch = { ...payload, id: db.idCounters.launches++ };
        db.launches.unshift(launch);
        saveData(db);
        broadcast('ADD_LAUNCH', launch, ws);
        ws.send(JSON.stringify({ type: 'LAUNCH_ID', payload: { tempId: payload.id, realId: launch.id } }));
        break;
      }
      case 'DELETE_LAUNCH': {
        db.launches = db.launches.filter(l => l.id !== payload.id);
        saveData(db);
        broadcast('DELETE_LAUNCH', { id: payload.id }, ws);
        break;
      }
      case 'CLEAR_LAUNCHES': {
        db.launches = [];
        saveData(db);
        broadcast('CLEAR_LAUNCHES', {}, ws);
        break;
      }

      default: break;
    }
  });

  ws.on('error', e => console.error('WS error:', e.message));
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(__dirname));
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));

server.listen(PORT, () => console.log(`Fast TV War Room running on port ${PORT}`));
