const express = require('express');
const fileUpload = require('express-fileupload');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const WebSocket = require('ws');

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

// Load items.txt
async function loadItemsTxt() {
    try {
        const data = await fs.readFile('items.txt', 'utf8');
        const itemsDb = {};
        data.split('\n').forEach(line => {
            if (line.trim()) {
                const fields = line.split('|');
                const name = fields[1]; // name field
                const mageloId = fields[5]; // id field
                itemsDb[name] = { mageloId, lore: fields[2] }; // Store lore for tooltips
            }
        });
        return itemsDb;
    } catch (err) {
        console.error('Error loading items.txt:', err);
        return {};
    }
}

function processLogFile(data) {
    // Parse log lines like: [Sat May 31 17:16:00 2025] Alexr looted a Flowing Black Silk Sash from a corpse.
    const lootPattern = /\[(.*?)\] (\w+) looted an? ([\w\s'-]+) from/;
    const lootData = [];
    data.split('\n').forEach(line => {
        const match = line.match(lootPattern);
        if (match) {
            const [, timestamp, player, item] = match;
            lootData.push({
                player,
                item: item.trim(),
                timestamp
            });
        }
    });
    return lootData;
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/upload', async (req, res) => {
    if (!req.files || !req.files.logFile) {
        return res.status(400).json({ message: 'No file uploaded' });
    }
    try {
        const logFile = req.files.logFile;
        const data = logFile.data.toString('utf8');
        const lootData = processLogFile(data);
        if (!lootData.length) {
            return res.status(400).json({ message: 'No loot data found in log file' });
        }
        const itemsDb = await loadItemsTxt();
        lootData.forEach(entry => {
            entry.mageloId = itemsDb[entry.item]?.mageloId || 'Unknown';
            entry.lore = itemsDb[entry.item]?.lore || entry.item;
        });
        res.json({ lootData });
    } catch (err) {
        console.error('Error processing file:', err);
        res.status(500).json({ message: 'Error processing file' });
    }
});

app.post('/assign', async (req, res) => {
    const { selectedItems, recipients } = req.body;
    try {
        const assignments = selectedItems.map((item, i) => ({
            item,
            recipient: recipients[i],
            date: new Date().toISOString()
        }));
        const historyLine = assignments.map(a => `${a.date},${a.item},${a.recipient}`).join('\n');
        await fs.appendFile('loot_history.txt', historyLine + '\n');
        // Broadcast assignments to WebSocket clients
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'assignment', assignments }));
            }
        });
        res.json({ message: 'Loot assigned successfully' });
    } catch (err) {
        console.error('Error saving assignments:', err);
        res.status(500).json({ message: 'Error saving assignments' });
    }
});

app.get('/history', async (req, res) => {
    try {
        const data = await fs.readFile('loot_history.txt', 'utf8').catch(() => '');
        const history = data.split('\n').filter(line => line).map(line => {
            const [date, item, recipient] = line.split(',');
            return { date, item, recipient };
        });
        res.json({ history });
    } catch (err) {
        console.error('Error reading history:', err);
        res.status(500).json({ message: 'Error reading history' });
    }
});

// WebSocket connection
wss.on('connection', ws => {
    console.log('WebSocket client connected');
    ws.on('close', () => console.log('WebSocket client disconnected'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
