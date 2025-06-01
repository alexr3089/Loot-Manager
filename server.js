const express = require('express');
const fileUpload = require('express-fileupload');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const WebSocket = require('ws');

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(fileUpload()); // ✅ Enable file upload parsing


let items = []; // In-memory loot list

// Load items.txt
async function loadItemsTxt() {
    try {
        const data = await fs.readFile('items.txt', 'utf8');
        const itemsDb = {};
        data.split('\n').forEach(line => {
            if (line.trim()) {
                const fields = line.split('|');
                const name = fields[1]; // name
                const mageloId = fields[5]; // id
                itemsDb[name] = mageloId;
            }
        });
        return itemsDb;
    } catch (err) {
        console.error('Error loading items.txt:', err);
        return {};
    }
}

function processLogFile(data) {
    // Parse log lines like: [Sat May 31 23:34:56 2025] Alexr looted a Cloth Cap from a corpse.
    const lootPattern = /\[(.*?)\] (\w+) looted an? ([\w\s'-]+) from/;
    const lootData = [];
    data.split('\n').forEach(line => {
        const match = line.match(lootPattern);
        if (match) {
            const [, timestamp, player, item] = match;
            lootData.push({ looter: player, name: item.trim(), timestamp });
        }
    });
    return lootData;
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/upload-log', async (req, res) => {
    console.log('Received upload request:', req.files); // Debug
    if (!req.files || !req.files.logFile) {
        console.error('No logFile in request');
        return res.status(400).json({ status: 'error', message: 'No file uploaded or incorrect field name' });
    }
    try {
        const logFile = req.files.logFile;
        const data = logFile.data.toString('utf8');
        const lootData = processLogFile(data);
        if (!lootData.length) {
            return res.status(400).json({ status: 'error', message: 'No loot data found in log file' });
        }
        const itemsDb = await loadItemsTxt();
        items = lootData.map(entry => ({
            looter: entry.looter,
            name: entry.name,
            id: itemsDb[entry.name] || 'Unknown',
            recipient: '',
            distributed: false
        }));
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'lootListUpdate', items }));
            }
        });
        res.json({ status: 'ok' });
    } catch (err) {
        console.error('Error processing file:', err);
        res.status(500).json({ status: 'error', message: 'Error processing file: ' + err.message });
    }
});

// WebSocket
wss.on('connection', ws => {
    console.log('WebSocket client connected');
    ws.send(JSON.stringify({ type: 'lootListUpdate', items }));
    ws.on('message', async message => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'itemUpdate') {
                const { index, recipient, distributed } = data;
                if (items[index]) {
                    items[index].recipient = recipient;
                    items[index].distributed = distributed;
                    if (distributed) {
                        const assignment = {
                            date: new Date().toISOString(),
                            item: items[index].name,
                            recipient
                        };
                        await fs.appendFile('loot_history.txt', `${assignment.date},${assignment.item},${assignment.recipient}\n`);
                    }
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: 'itemUpdate',
                                index,
                                looter: items[index].looter,
                                name: items[index].name,
                                id: items[index].id,
                                recipient,
                                distributed
                            }));
                        }
                    });
                }
            }
        } catch (err) {
            console.error('WebSocket error:', err);
        }
    });
    ws.on('close', () => console.log('WebSocket client disconnected'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
