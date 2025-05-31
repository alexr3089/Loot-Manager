
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());

let currentLootList = [];

function broadcast(data, sender) {
  wss.clients.forEach(client => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

wss.on('connection', ws => {
  console.log('Client connected');

  // Send current loot list to new connection
  if (currentLootList.length > 0) {
    ws.send(JSON.stringify({ type: 'lootListUpdate', items: currentLootList }));
  }

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'lootListUpdate') {
        currentLootList = data.items;
      }

      broadcast(data, ws);
    } catch (err) {
      console.error('Invalid message received:', err);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
