
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

app.post('/upload-log', (req, res) => {
  console.log('---- UPLOAD RECEIVED ----');
  console.log('Headers:', req.headers);
  console.log('Body type:', typeof req.body);
  console.log('Files:', req.files);

  if (!req.files || !req.files.logFile) {
    console.log('❌ No file uploaded or wrong field name');
    return res.status(400).send('No file uploaded.');
  }

  const log = req.files.logFile;
  const lines = log.data.toString().split('\n');
  const validLooters = ['You', 'Emilyn', 'Aerisia', 'Allinye', 'Izatri', 'Rainne', 'Melise', 'Renvain',
                        'Kristalyn', 'Ellinye', 'Sarilyn', 'Lucilly', 'Aelise', 'Renvina', 'Ayria'];

  const lootRegexes = [
    /(\w+) has looted (?:a|an) (.+?)(?: from|$)/i,
    /(\w+) looted a (.+?)(?: from|$)/i,
    /(\w+) looted an (.+?)(?: from|$)/i,
    /(\w+) looted (.+?)(?: from|$)/i,
    /(.+?) was looted by (\w+)/i,
    /--You have looted (?:a|an) (.+?) from .*?--/i,
    /--(\w+) has looted (?:a|an) (.+?) from .*?--/i
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
        } else if (regex.source.includes('You have looted')) {
          itemName = match[1].trim();
          looter = 'You';
        } else if (regex.source.includes('--') && regex.source.includes('has looted')) {
          looter = match[1].trim();
          itemName = match[2].trim();
        } else {
          looter = match[1].trim();
          itemName = match[2].trim();
        }
        parsedItems.push({
          looter,
          name: itemName,
          id: itemMap[itemName.toLowerCase()]?.id || 999,
          recipient: '',
          distributed: false
        });
        break;
      }
    }
  }

  liveItems = parsedItems.sort((a, b) => a.name.localeCompare(b.name));
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'lootListUpdate', items: liveItems }));
    }
  });
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
          wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'itemUpdate', index: data.index, ...item }));
            }
          });
        }
      }
    } catch (err) {
      console.error('Invalid WS message:', err);
    }
  });
});

server.listen(PORT, () => {
  console.log('🚀 Server started on port', PORT);
});
