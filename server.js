const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

const ITEM_DB_PATH = path.join(__dirname, 'items.txt');

app.use(express.static('public'));
app.use(express.json());

const CLASS_MAP = [
    'WAR', 'CLR', 'PAL', 'RNG',
    'SHD', 'DRU', 'MNK', 'BRD',
    'ROG', 'SHM', 'NEC', 'WIZ',
    'MAG', 'ENC', 'BST', 'BER'
];


const ROLE_GROUPS = {
    Melee: ['WAR', 'PAL', 'SHD', 'RNG', 'ROG', 'BER', 'BRD', 'MNK', 'BST'],
    Caster: ['CLR', 'DRU', 'SHM', 'NEC', 'MAG', 'ENC', 'WIZ'],
    Healer: ['CLR', 'DRU', 'SHM'],
    Pet: ['BST', 'NEC', 'MAG'],
    Cloth: ['NEC', 'MAG', 'ENC', 'WIZ'],
    Leather: ['DRU', 'MNK', 'BST'],
    Chain: ['BER', 'ROG', 'RNG', 'SHM'],
    Plate: ['WAR', 'CLR', 'PAL', 'SHD', 'BRD']
};

const SLOT_MAP = {
    0: 'Charm',
    1: 'Left Ear',
    2: 'Head',
    3: 'Face',
    4: 'Right Ear',
    5: 'Neck',
    6: 'Shoulders',
    7: 'Arms',
    8: 'Back',
    9: 'Left Wrist',
    10: 'Right Wrist',
    11: 'Range',
    12: 'Hands',
    13: 'Primary',
    14: 'Secondary',
    15: 'Left Ring',
    16: 'Right Ring',
    17: 'Chest',
    18: 'Legs',
    19: 'Feet',
    20: 'Waist'
};

const SLOT_PRIORITY = Object.values(SLOT_MAP);

function decodeClassMask(mask) {
    const intVal = parseInt(mask, 10);
    return CLASS_MAP
        .map((abbr, idx) => (intVal & (1 << idx)) ? abbr : null)
        .filter(Boolean)
        .join(' ');
}

function decodeSlotMask(mask) {
    const intVal = parseInt(mask, 10);
    const slots = [];

    for (let i = 0; i <= 20; i++) {
        if (intVal & (1 << i)) {
            slots.push(SLOT_MAP[i]);
        }
    }

    return slots;
}



function getRoleType(decodedClasses) {
  const classList = decodedClasses.split(' ').filter(Boolean);
  const classSet = new Set(classList);

  if (classSet.size === CLASS_MAP.length) {
    return 'ALL';
  }

  for (const [roleName, roleClasses] of Object.entries(ROLE_GROUPS)) {
    const roleSet = new Set(roleClasses);
    const allInRole = classList.every(c => roleSet.has(c));
    if (allInRole) return roleName;
  }

  return 'Mixed';
}

// Load and index items once
let itemIndex = {};
fs.readFileSync(ITEM_DB_PATH, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .reduce((acc, line, i) => {
        const parts = line.split('|');
        if (i === 0) {
            acc.headers = parts;
            acc.nameIdx = acc.headers.indexOf('name');
            acc.idIdx = acc.headers.indexOf('id');
            acc.slotsIdx = acc.headers.indexOf('slots');
            acc.classesIdx = acc.headers.indexOf('classes');
        } else {
            const name = parts[acc.nameIdx];
            if (name) {
                const decodedClasses = decodeClassMask(parts[acc.classesIdx]);
                const decodedSlots = decodeSlotMask(parts[acc.slotsIdx]);
                itemIndex[name.toLowerCase()] = {
                    name,
                    id: parts[acc.idIdx],
                    slots: decodedSlots,                   // ← Now an array of strings
                    slotIndex: SLOT_PRIORITY.indexOf(decodedSlots[0]),
                    classes: decodedClasses,
                    roleType: getRoleType(decodedClasses)
                };
            }
        }
        return acc;
    }, {});

app.post('/search-items', (req, res) => {
    const { names } = req.body;
    const results = names.map(n => itemIndex[n.toLowerCase()]).filter(Boolean);
    res.json(results);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
