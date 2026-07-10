const fs = require('fs');
const d = JSON.parse(fs.readFileSync('eval/results/eval-checkpoint.json', 'utf-8'));
const remove = ['POS-2026-001', 'POS-2026-002', 'POS-2026-004', 'POS-2026-005'];
d.completedIds = d.completedIds.filter(id => !remove.includes(id));
d.positives = d.positives.filter(r => !remove.includes(r.caseId));
fs.writeFileSync('eval/results/eval-checkpoint.json', JSON.stringify(d, null, 2));
console.log('Cleared: ' + remove.join(', '));
console.log('Remaining: ' + d.completedIds.length + ' completed, ' + d.positives.length + ' positives');
