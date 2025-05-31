const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const https = require('https');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(fileUpload());

let itemMap = {};
let liveItems = [];

// ✅ Load items.txt from Dropbox
function loadItemDatabaseFromURL(url) {
  console.log('Loading item DB from Dropbox...');
  https.get(url, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const lines = data.split('\n');
      lines.forEach(line => {
        const [id, name, slots, classes] = line.split('|');
        if (!id || !name) return;
        itemMap[name.trim().toLowerCase()] = {
          id: parseInt(id),
          name: name.trim()
        };
      });
      console.log('Item DB loaded from Dropbox. Items:', Object.keys(itemMap).length);
    });
  }).on('error', err => {
    console.error('Failed to fetch item DB from Dropbox:', err.message);
  });
}

function broadcast(data, sender) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

app.post('/upload-log', (req, res) => {
  if (!req.files || !req.files.logFile) {
    return res.status(400).send('No file uploaded.');
  }

  const log = req.files.logFile;
  const lines = log.data.toString().split('\n');
  const validLooters = ['Emilyn', 'Aerisia', 'Allinye', 'Izatri', 'Rainne', 'Melise', 'Renvain',
                        'Kristalyn', 'Ellinye', 'Sarilyn', 'Lucilly', 'Aelise', 'Renvina', 'Ayria'];

  const lootRegexes = [
    /(\w+) has looted (?:a|an) (.+?)(?: from|$)/i,
    /(\w+) looted a (.+?)(?: from|$)/i,
    /(\w+) looted an (.+?)(?: from|$)/i,
    /(\w+) looted (.+?)(?: from|$)/i,
    /(.+?) was looted by (\w+)/i
  ];

  const parsedItems = [];

  for (const line of lines) {
    for (const regex of lootRegexes) {
      const match = line.match(regex);
      if (match) {
        let looter, itemName;
        if (regex.source.includes('was looted by')) {
          itemName = match[1].trim();
          looter = match[2].trim();
        } else {
          looter = match[1].trim();
          itemName = match[2].trim();
        }

        if (validLooters.includes(looter)) {
          const item = itemMap[itemName.toLowerCase()];
          if (item) {
            parsedItems.push({
              looter,
              name: item.name,
              id: item.id,
              recipient: '',
              distributed: false
            });
          }
        }
        break;
      }
    }
  }

  liveItems = parsedItems.sort((a, b) => a.name.localeCompare(b.name));
  broadcast({ type: 'lootListUpdate', items: liveItems });
  res.json({ status: 'ok' });
});

wss.on('connection', ws => {
  console.log('New client connected');
  ws.send(JSON.stringify({ type: 'lootListUpdate', items: liveItems }));

  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'itemUpdate') {
        const item = liveItems[data.index];
        if (item) {
          item.recipient = data.recipient;
          item.distributed = data.distributed;
          broadcast({ type: 'itemUpdate', index: data.index, ...item }, ws);
        }
      }
    } catch (err) {
      console.error('Invalid WS message:', err);
    }
  });
});

server.listen(PORT, () => {
  console.log('Server started on port', PORT);
  loadItemDatabaseFromURL('https://www.dropbox.com/scl/fi/m4id9ni2cwcm0plqs52yh/items.txt?rlkey=j4xgk8spzrh7p3egswepurujd&raw=1');
});
