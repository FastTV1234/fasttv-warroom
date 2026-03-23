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
  tasks: [],
  pipeline: {
    'Concept': [],
    'Beat Sheet': [],
    'Greenlight (Contract)': [],
    'Casting': [],
    'Scripting': [],
    'Production': [],
    'Post Production': [],
    'Launched': [],
    'Marketing': []
  },
  launches: [],
  idCounters: { tasks: 1, launches: 1 }
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
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&count=5`;
    const data = await fetchUrl(proxyUrl);
    const parsed = JSON.parse(data);
    if(parsed.items) {
      return res.json(parsed.items.map(item => ({
        title: item.title || '',
        link: item.link || '',
        pubDate: item.pubDate || '',
        source: item.author || ''
      })));
    }
    res.json([]);
  } catch(e) {
    // Fallback to direct fetch
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
      const xml = await fetchUrl(url);
      const items = parseRSS(xml);
      res.json(items);
    } catch(e2) {
      res.json([]);
    }
  }
});

app.get('/api/youtube', async (req, res) => {
  const channelId = req.query.channelId;
  if(!channelId) return res.json([]);

  // Try direct YouTube XML first (Railway can reach YouTube)
  try {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const xml = await fetchUrl(url);
    if(xml.includes('<entry>')) {
      const items = [];
      const entryMatches = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
      entryMatches.slice(0, 15).forEach(entry => {
        const title = (entry.match(/<title>(.*?)<\/title>/) || [])[1] || '';
        const link = (entry.match(/<link rel="alternate" href="(.*?)"/) || [])[1] || '';
        const published = (entry.match(/<published>(.*?)<\/published>/) || [])[1] || '';
        if(title) items.push({ title: title.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'), link, pubDate: published });
      });
      if(items.length > 0) return res.json(items);
    }
  } catch(e) { /* fall through to proxy */ }

  // Fallback — rss2json proxy
  try {
    const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId)}&count=15`;
    const data = await fetchUrl(proxyUrl);
    const parsed = JSON.parse(data);
    if(parsed.items && parsed.items.length > 0) {
      return res.json(parsed.items.map(item => ({ title: item.title || '', link: item.link || '', pubDate: item.pubDate || '' })));
    }
  } catch(e) { /* skip */ }

  return res.json([]);
});

// ── Clear data endpoint (wipes saved data.json back to empty defaults) ─────────
app.post('/api/clear-data', (req, res) => {
  const secret = req.query.secret;
  if(secret !== 'fasttv2026') return res.status(403).json({ error: 'Unauthorized' });
  try {
    if(fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
    db = loadData();
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type:'INIT', payload:db })); });
    res.json({ success: true, message: 'Data cleared and reset to empty defaults' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => res.sendFile(INDEX_FILE));
app.get('/index.html', (req, res) => res.sendFile(INDEX_FILE));
app.use((req, res) => res.sendFile(INDEX_FILE));

server.listen(PORT, () => console.log(`Fast TV War Room v3 running on port ${PORT}`));
