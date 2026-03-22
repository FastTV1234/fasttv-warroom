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
const INDEX_FILE = path.join(__dirname, 'index.html');

const DEFAULT_DATA = {
  tasks: [
    { id:1, text:'Check DramaBox & ReelShort Meta Ad Library', owner:'Priya', due:'today', done:false },
    { id:2, text:'Screenshot top 3 Kuku TV YouTube pre-roll creatives', owner:'Arjun', due:'today', done:false },
    { id:3, text:'Research JioHotstar Sparks pilot launch date', owner:'Rahul', due:'this-week', done:false },
    { id:4, text:'Greenlight decision: Bhojpuri romance series', owner:'Me', due:'today', done:false },
    { id:5, text:'Map ReelSaga genre library', owner:'Priya', due:'this-week', done:false },
    { id:6, text:'Track Kuku TV Hindi show launch count this week', owner:'Arjun', due:'this-week', done:false }
  ],
  pipeline: {
    'Ideation': [
      { title:'Revenge Bahu', genre:'Crime / Revenge', lang:'Hindi', priority:'High', logline:'Daughter-in-law discovers family secret and reclaims what is hers.' },
      { title:'Startup Queen', genre:'Workplace thriller', lang:'Hindi', priority:'Medium', logline:'Small-town girl disrupts Mumbai startup funded by the man who wronged her family.' }
    ],
    'Greenlit': [{ title:'Kuch Ankahi Baatein', genre:'Romance / CEO', lang:'Marathi', priority:'High', logline:'Billionaire falls for the one woman not impressed by his wealth.' }],
    'In Production': [{ title:'Dil Ka Badla', genre:'Romance / CEO', lang:'Hindi', priority:'High', logline:'She fakes amnesia to escape a forced marriage.' }],
    'Post Production': [],
    'Launched': [{ title:'Raat Ka Raaz', genre:'Supernatural', lang:'Hindi', priority:'Medium', logline:'Night watchman discovers the building hides a 40-year-old secret.' }]
  },
  launches: [
    { id:1, title:'CEO Ka Raaz', platform:'DramaBox', genre:'Romance / CEO', lang:'Hindi', eps:72, promo:'Heavy', source:'Meta Ads', hook:'He married me but never looked at me.', notes:'18 active ad creatives.', logger:'Priya', date:'2026-03-18' },
    { id:2, title:'Badla Mera Haq', platform:'DramaBox', genre:'Crime / Revenge', lang:'Hindi', eps:65, promo:'Heavy', source:'Meta Ads', hook:'You humiliated me. Now watch who I become.', notes:'Revenge arc.', logger:'Arjun', date:'2026-03-17' },
    { id:3, title:'Anari Pati', platform:'Kuku TV', genre:'Romance / CEO', lang:'Hindi', eps:80, promo:'Moderate', source:'YouTube Ads', hook:'He acted useless but ran the whole empire.', notes:'Hidden identity trope.', logger:'Rahul', date:'2026-03-15' },
    { id:4, title:'Alpha CEO', platform:'ReelShort', genre:'Romance / CEO', lang:'Hindi', eps:75, promo:'Heavy', source:'Meta Ads', hook:'He never smiled. Until she walked in.', notes:'13 creatives.', logger:'Rahul', date:'2026-03-06' }
  ],
  idCounters: { tasks: 7, launches: 5 }
};

function loadData() {
  try { if(fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch(e) { console.error('Load error:', e.message); }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}
function saveData(data) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
  catch(e) { console.error('Save error:', e.message); }
}

let db = loadData();

function broadcast(type, payload, skip) {
  const msg = JSON.stringify({ type, payload });
  wss.clients.forEach(c => { if(c !== skip && c.readyState === WebSocket.OPEN) c.send(msg); });
}

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'INIT', payload: db }));
  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const { type, payload } = msg;
    switch(type) {
      case 'ADD_TASK': { const task = { ...payload, id: db.idCounters.tasks++ }; db.tasks.unshift(task); saveData(db); broadcast('ADD_TASK', task, ws); break; }
      case 'TOGGLE_TASK': { const t = db.tasks.find(x => x.id === payload.id); if(t) { t.done = !t.done; saveData(db); broadcast('TOGGLE_TASK', { id: t.id, done: t.done }, ws); } break; }
      case 'MOVE_CARD': { const { fromStage, toStage, idx } = payload; if(!db.pipeline[fromStage] || idx < 0 || idx >= db.pipeline[fromStage].length) break; const [card] = db.pipeline[fromStage].splice(idx, 1); db.pipeline[toStage] = db.pipeline[toStage] || []; db.pipeline[toStage].push(card); saveData(db); broadcast('PIPELINE_UPDATE', db.pipeline, ws); ws.send(JSON.stringify({ type: 'PIPELINE_UPDATE', payload: db.pipeline })); break; }
      case 'ADD_CARD': { const { stage, card } = payload; db.pipeline[stage] = db.pipeline[stage] || []; db.pipeline[stage].push(card); saveData(db); broadcast('PIPELINE_UPDATE', db.pipeline, ws); ws.send(JSON.stringify({ type: 'PIPELINE_UPDATE', payload: db.pipeline })); break; }
      case 'EDIT_CARD': { const { stage, idx, card } = payload; if(db.pipeline[stage] && db.pipeline[stage][idx]) { db.pipeline[stage][idx] = { ...db.pipeline[stage][idx], ...card }; saveData(db); broadcast('PIPELINE_UPDATE', db.pipeline, ws); ws.send(JSON.stringify({ type: 'PIPELINE_UPDATE', payload: db.pipeline })); } break; }
      case 'DELETE_CARD': { const { stage, idx } = payload; if(db.pipeline[stage] && db.pipeline[stage][idx] !== undefined) { db.pipeline[stage].splice(idx, 1); saveData(db); broadcast('PIPELINE_UPDATE', db.pipeline, ws); ws.send(JSON.stringify({ type: 'PIPELINE_UPDATE', payload: db.pipeline })); } break; }
      case 'ADD_LAUNCH': { const launch = { ...payload, id: db.idCounters.launches++ }; db.launches.unshift(launch); saveData(db); broadcast('ADD_LAUNCH', launch, ws); break; }
      case 'DELETE_LAUNCH': { db.launches = db.launches.filter(l => l.id !== payload.id); saveData(db); broadcast('DELETE_LAUNCH', { id: payload.id }, ws); break; }
      case 'CLEAR_LAUNCHES': { db.launches = []; saveData(db); broadcast('CLEAR_LAUNCHES', {}, ws); break; }
      default: break;
    }
  });
  ws.on('error', e => console.error('WS error:', e.message));
});

app.use(express.json());

// ── RSS Proxy (avoids CORS issues in browser) ─────────────────────────────────
const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseRSS(xml) {
  const items = [];
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  itemMatches.slice(0, 5).forEach(item => {
    const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/) || [])[1] || '';
    const link = (item.match(/<link>(.*?)<\/link>/) || [])[1] || '';
    const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
    const source = (item.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] || '';
    if(title) items.push({ title: title.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'), link, pubDate, source });
  });
  return items;
}

app.get('/api/news', async (req, res) => {
  const q = req.query.q;
  if(!q) return res.json([]);
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const xml = await fetchUrl(url);
    const items = parseRSS(xml);
    res.json(items);
  } catch(e) {
    res.json([]);
  }
});

app.get('/api/youtube', async (req, res) => {
  const channelId = req.query.channelId;
  if(!channelId) return res.json([]);
  try {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const xml = await fetchUrl(url);
    const items = [];
    const entryMatches = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
    entryMatches.slice(0, 10).forEach(entry => {
      const title = (entry.match(/<title>(.*?)<\/title>/) || [])[1] || '';
      const link = (entry.match(/<link rel="alternate" href="(.*?)"/) || [])[1] || '';
      const published = (entry.match(/<published>(.*?)<\/published>/) || [])[1] || '';
      if(title) items.push({ title: title.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'), link, pubDate: published });
    });
    res.json(items);
  } catch(e) {
    res.json([]);
  }
});

app.get('/', (req, res) => res.sendFile(INDEX_FILE));
app.get('/index.html', (req, res) => res.sendFile(INDEX_FILE));
app.use((req, res) => res.sendFile(INDEX_FILE));

server.listen(PORT, () => console.log(`Fast TV War Room v3 running on port ${PORT}`));
