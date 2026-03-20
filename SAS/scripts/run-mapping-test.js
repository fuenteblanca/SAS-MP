const { mapRequests, formatTime12 } = require('../services/requestMapper');

// Sample payloads to test mapping logic
const samples = [
  {
    id: 101,
    action: 'time_in',
    date: '2025-11-25',
    requested_time: '08:05:00',
    reason: 'Late due to traffic',
    status: 'pending',
  },
  {
    id: 102,
    action: 'time_out',
    date: '2025-11-25',
    requested_time: '17:45:00',
    reason: 'Left late',
    status: 'approved',
    approver_name: 'Manager One',
    approved_at: '2025-11-25T18:00:00',
  },
  {
    id: 103,
    action: 'overtime',
    date: '2025-11-24',
    time_out: '20:15:00',
    reason: 'Site emergency',
    status: 'approved',
    approver: { name: 'Supervisor A' },
    approved_at: '2025-11-24T21:00:00'
  }
];

function assert(cond, msg) {
  if (!cond) {
    console.error('Assertion failed:', msg);
    process.exit(2);
  }
}

const mapped = mapRequests(samples);
console.log('Mapped output:', JSON.stringify(mapped, null, 2));

// Expect 3 items
assert(mapped.length === 3, 'Should map three items');

// Expect first item to be the one with approved_at 2025-11-25T18:00:00 (id 102)
assert(mapped[0].id === '102', 'Most recent should come first (id 102)');

// Expect one of them to be type Overtime with iconColor '#F59E0B'
const ot = mapped.find(m => m.type === 'Overtime');
assert(ot, 'Should include an Overtime item');
assert(ot.iconColor === '#F59E0B', 'Overtime iconColor expected');

console.log('All mapping tests passed');
process.exit(0);
