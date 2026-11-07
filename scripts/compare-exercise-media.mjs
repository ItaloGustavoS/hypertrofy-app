import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const CAT = path.join(ROOT, 'catalogue', 'exercises');
const V1_PATH = path.join(ROOT, 'scripts', '_v1_exercises.json');
const YU_PATH = 'C:/Users/Ítalo/.local/share/opencode/tool-output/tool_1b73e211e001K2fY0TXcnLNuOZ';

const norm = (s) => String(s || '')
  .toLowerCase()
  .replace(/[’']/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const normName = (s) => norm(s)
  .replace(/\b(female|male|version|variation|v\d)\b/g, '')
  .replace(/\s+/g, ' ').trim();

const eqMap = {
  'body only': 'bodyweight', 'body weight': 'bodyweight', 'bodyweight': 'bodyweight', 'assisted': 'bodyweight',
  'barbell': 'barbell', 'ez barbell': 'barbell', 'olympic barbell': 'barbell', 'e z curl bar': 'barbell',
  'dumbbell': 'dumbbell', 'dumbbells': 'dumbbell',
  'kettlebell': 'kettlebell', 'kettlebells': 'kettlebell',
  'cable': 'cable',
  'machine': 'machine', 'leverage machine': 'machine', 'smith machine': 'machine', 'sled machine': 'machine',
  'band': 'band', 'bands': 'band', 'resistance band': 'band',
  'medicine ball': 'medicine ball', 'exercise ball': 'ball', 'stability ball': 'ball', 'bosu ball': 'ball',
  'foam roll': 'other', 'roller': 'other', 'wheel roller': 'other', 'other': 'other', 'trap bar': 'barbell',
  'tire': 'other', 'weighted': 'weighted', 'rope': 'cable', 'suspended': 'bodyweight', 'suspension': 'bodyweight'
};
const normEq = (s) => { if (Array.isArray(s)) s = s[0]; const k = norm(s); return eqMap[k] || k || 'unknown'; };

const musMap = {
  'abdominals': 'abs', 'abs': 'abs', 'waist': 'abs', 'obliques': 'abs',
  'quadriceps': 'quads', 'quads': 'quads',
  'hamstrings': 'hamstrings', 'hams': 'hamstrings',
  'glutes': 'glutes',
  'calves': 'calves',
  'biceps': 'biceps',
  'triceps': 'triceps',
  'forearms': 'forearms',
  'shoulders': 'shoulders', 'delts': 'shoulders', 'rear deltoids': 'shoulders',
  'chest': 'chest', 'pectorals': 'chest',
  'lats': 'back', 'upper back': 'back', 'middle back': 'back', 'lower back': 'back', 'back': 'back', 'spine': 'back', 'traps': 'back',
  'adductors': 'adductors', 'abductors': 'abductors',
  'neck': 'neck', 'cardiovascular system': 'cardio', 'heart': 'cardio'
};
const normMus = (s) => { if (Array.isArray(s)) s = s[0]; const k = norm(s); return musMap[k] || k || ''; };

const tokenSet = (s) => new Set(normName(s).split(' ').filter(Boolean));
const jaccard = (a, b) => {
  const A = tokenSet(a), B = tokenSet(b);
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  const uni = new Set([...A, ...B]).size || 1;
  return inter / uni;
};

function localExercises() {
  const out = [];
  for (const f of fs.readdirSync(CAT)) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(fs.readFileSync(path.join(CAT, f), 'utf8'));
    if (!j.name) continue; // variant stubs
    out.push({ id: j.id, name: j.name, eq: normEq(j.equipment), target: normMus(j.target), body: normMus(j.bodyPart) });
  }
  return out;
}

function v1Exercises() {
  const raw = JSON.parse(fs.readFileSync(V1_PATH, 'utf8'));
  return raw.map(x => ({
    sid: x.exerciseId, name: x.name, eq: normEq((x.equipments||[])[0]||x.equipment),
    target: normMus((x.targetMuscles||[])[0]), body: normMus((x.bodyParts||[])[0]),
    gif: x.gifUrl || null
  }));
}

function yuExercises() {
  const raw = JSON.parse(fs.readFileSync(YU_PATH, 'utf8'));
  const base = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
  return raw.map(x => ({
    sid: x.id, name: x.name, eq: normEq(x.equipment),
    target: normMus((x.primaryMuscles||[])[0]), body: '',
    img: (x.images && x.images[0]) ? base + x.images[0] : null,
    imgs: x.images || []
  }));
}

function buildIndex(list) {
  const byName = new Map();
  const byEq = new Map();
  for (const x of list) {
    const k = normName(x.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(x);
    if (!byEq.has(x.eq)) byEq.set(x.eq, []);
    byEq.get(x.eq).push(x);
  }
  return { byName, byEq, list };
}

function bestMatch(local, idx) {
  const k = normName(local.name);
  // 1. exact normalized name
  let cands = idx.byName.get(k) || [];
  let exact = cands.find(c => c.eq === local.eq) || cands.find(c => c.target === local.target) || cands[0];
  if (exact) return { ext: exact, conf: (exact.eq === local.eq ? 'high' : 'med'), score: 1 };
  // 2. fuzzy within same equipment bucket, else all
  const pool = (idx.byEq.get(local.eq) || []).concat(local.eq === 'bodyweight' ? (idx.byEq.get('unknown')||[]) : []);
  const search = pool.length ? pool : idx.list;
  let best = null, bs = 0;
  for (const c of search) {
    const s = jaccard(local.name, c.name);
    if (s > bs) { bs = s; best = c; }
  }
  if (best && bs >= 0.82) return { ext: best, conf: 'high', score: bs };
  if (best && bs >= 0.68 && (best.eq === local.eq || best.target === local.target || local.target === best.target)) return { ext: best, conf: 'med', score: bs };
  if (best && bs >= 0.75) return { ext: best, conf: 'med', score: bs };
  return null;
}

function report(label, matches, total) {
  const high = matches.filter(m=>m.conf==='high').length;
  const med = matches.filter(m=>m.conf==='med').length;
  console.log(`\n== ${label} ==`);
  console.log(`total local (with name): ${total}`);
  console.log(`matched: ${matches.length} (${(matches.length/total*100).toFixed(1)}%)  | high: ${high}  med: ${med}`);
  const byEq = {};
  for (const m of matches) byEq[m.local.eq] = (byEq[m.local.eq]||0)+1;
  console.log('matched by equipment:', Object.entries(byEq).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>k+':'+v).join(', '));
  console.log('samples (high):');
  for (const m of matches.filter(m=>m.conf==='high').slice(0,5)) console.log(`  [${m.local.id}] ${m.local.name} (${m.local.eq}/${m.local.target}) -> ${m.ext.name} (${m.ext.eq}/${m.ext.target}) ${m.ext.gif||m.ext.img||''}`);
  console.log('samples (med):');
  for (const m of matches.filter(m=>m.conf==='med').slice(0,5)) console.log(`  [${m.local.id}] ${m.local.name} (${m.local.eq}/${m.local.target}) -> ${m.ext.name} (${m.ext.eq}/${m.local.target}) score=${m.score.toFixed(2)}`);
  const unmatched = total - matches.length;
  console.log(`unmatched: ${unmatched}`);
  return { matched: matches.length, high, med };
}

const locals = localExercises();
const v1 = buildIndex(v1Exercises());
const yu = buildIndex(yuExercises());
console.log('local:', locals.length, '| v1:', v1.list.length, '| yuhonas:', yu.list.length);

const mv1 = []; const myu = [];
for (const l of locals) {
  const a = bestMatch(l, v1); if (a) mv1.push({ local: l, ...a });
  const b = bestMatch(l, yu); if (b) myu.push({ local: l, ...b });
}
const r1 = report('AscendAPI / ExerciseDB v1 (GIF 180p, free, cacheable)', mv1, locals.length);
const r2 = report('yuhonas/free-exercise-db (Unlicense, static JPGs, public domain)', myu, locals.length);

const both = new Set(mv1.filter(m=>m.conf==='high').map(m=>m.local.id));
const yHigh = myu.filter(m=>m.conf==='high').map(m=>m.local.id);
const unionHigh = new Set([...both, ...yHigh]);
console.log(`\n== union (either, high confidence) == ${unionHigh.size} / ${locals.length} (${(unionHigh.size/locals.length*100).toFixed(1)}%)`);

console.log('\n== recommendation inputs ==');
console.log('v1 has gifUrl (animation) and aligns with textSource:exercisedb lineage; yuhonas is Unlicense (legally clean) but static images only and smaller set.');
console.log('Decision context: (2a) cut catalogue to what has free media; (3) downloaded+cached on device; (4) assume commercial terms OK.');
console.log('Most indicated (coverage + format fit + lineage):', r1.matched >= r2.matched ? 'ExerciseDB v1 (AscendAPI mirror) as primary, with yuhonas as gap-fill if needed' : 'yuhonas as primary, v1 as gap-fill');

// --emit <out> writes the v1 match map (the confirmed source) as { localId: { exerciseId, gifUrl, confidence, score } }
const ei = process.argv.indexOf('--emit');
if (ei >= 0 && process.argv[ei + 1]) {
  const out = process.argv[ei + 1];
  const map = {};
  for (const m of mv1) map[m.local.id] = { exerciseId: m.ext.sid, gifUrl: m.ext.gif, confidence: m.conf, score: +m.score.toFixed(3), name: m.ext.name };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(map, null, 2) + '\n', 'utf8');
  console.log(`\nemitted v1 map: ${Object.keys(map).length} entries -> ${out}`);
}
