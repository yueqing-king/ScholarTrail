import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDB, createProject, changeProject, recordClick, editRecord, setPaperTag } from '../extension/lib/core.js';
import { createBackup, parseBackup, planImport, MAX_BACKUP_BYTES } from '../extension/lib/backup.js';

function fixture() {
  const db = blankDB(), a = createProject(db, '文献综述'), b = createProject(db, '研究专题');
  const candidate = { title: 'A systematic review of collaborative learning', authors: 'A Morgan', year: '2024', doi: '10.1000/review', primary_url: 'https://example.org/review', external_ids: ['scholar:cid:review'] };
  const { paper } = recordClick(db, candidate, a.id, { search_query: 'collaborative learning', source_url: 'https://scholar.google.com/scholar?q=learning' });
  editRecord(db, a.id, paper.id, { note: 'Keep this idea\nA second line', not_relevant: true });
  setPaperTag(db, a.id, { paper_id: paper.id, name: '待精读', color: 'green' });
  recordClick(db, candidate, b.id); editRecord(db, b.id, paper.id, { note: 'Independent project note' });
  changeProject(db, 'archive', b.id);
  return db;
}
const json = db => JSON.stringify(createBackup(db));
test('backup round trip restores notes, tags, archived projects, dates and independent histories', async () => {
  const source = fixture(), restored = (await planImport(blankDB(), json(source))).db;
  for (const p of restored.projects) delete p.import_fingerprint;
  assert.deepEqual(restored, source);
});
test('legacy v1 exports without tags or backup_version remain importable', async () => {
  const db = fixture(); db.tags = []; db.project_papers.forEach(r => delete r.tag_ids);
  const backup = createBackup(db); delete backup.tags; delete backup.backup_version;
  const restored = (await planImport(blankDB(), JSON.stringify(backup))).db;
  assert.deepEqual(restored.tags, []); assert.ok(restored.project_papers.every(r => r.tag_ids.length === 0));
  assert.equal(restored.project_papers[0].note, db.project_papers[0].note);
});
test('preview does not mutate current data; conflicts create independent renamed projects', async () => {
  const current = fixture(), incoming = structuredClone(current);
  incoming.project_papers[0].note = 'An older backup note';
  const before = structuredClone(current), plan = await planImport(current, json(incoming));
  assert.deepEqual(current, before); assert.equal(plan.stats.projects, 1); assert.equal(plan.stats.skipped_projects, 1);
  assert.equal(plan.stats.renamed_projects, 1); assert.equal(plan.db.active_project_id, current.active_project_id);
  assert.equal(plan.db.project_papers[0].note, current.project_papers[0].note);
  const copy = plan.db.projects.find(p => p.name === '文献综述（导入）');
  assert.ok(copy); assert.notEqual(copy.id, current.projects[0].id);
  assert.equal(plan.db.project_papers.find(r => r.project_id === copy.id).note, 'An older backup note');
  assert.equal(plan.db.papers.length, current.papers.length);
  assert.ok(plan.db.encounters.some(e => e.project_id === copy.id));
});
test('repeated backups do not duplicate imported projects, even after a local note edit', async () => {
  const text = json(fixture()), first = await planImport(blankDB(), text);
  first.db.project_papers[0].note = 'New local work';
  const second = await planImport(first.db, text);
  assert.equal(second.stats.projects, 0); assert.equal(second.stats.records, 0); assert.equal(second.stats.skipped_projects, 2);
  assert.deepEqual(second.db, first.db);
});
test('changed backups are added as new snapshots instead of overwriting an imported project', async () => {
  const db = fixture(), first = await planImport(blankDB(), json(db));
  db.project_papers[0].note = 'Changed backup';
  const second = await planImport(first.db, json(db));
  assert.equal(second.stats.projects, 1); assert.equal(second.db.project_papers[0].note, first.db.project_papers[0].note);
  assert.ok(second.db.project_papers.some(r => r.note === 'Changed backup'));
});
test('identifier collisions with a different paper never reuse the existing project judgment', async () => {
  const current = fixture(), incoming = fixture();
  const oldID = incoming.papers[0].id;
  incoming.papers[0].id = current.papers[0].id; incoming.papers[0].doi = '10.1000/different';
  for (const row of [...incoming.project_papers, ...incoming.encounters]) if (row.paper_id === oldID) row.paper_id = incoming.papers[0].id;
  const plan = await planImport(current, json(incoming));
  assert.equal(plan.db.papers.length, 2); assert.notEqual(plan.db.papers[1].id, current.papers[0].id);
  assert.equal(plan.db.papers[1].doi, '10.1000/different');
});
test('unknown properties and credentials are excluded; unsafe URLs are removed', () => {
  const backup = createBackup(fixture()); backup.settings = { api_key: 'never-import-this-secret' };
  backup.papers[0].api_key = 'never-import-this-secret'; backup.papers[0].primary_url = 'javascript:alert(1)';
  backup.encounters[0].source_url = 'file:///private/file';
  const result = parseBackup(JSON.stringify(backup));
  assert.equal(result.removed_links, 2); assert.equal(result.db.papers[0].primary_url, '');
  assert.ok(!JSON.stringify(result.db).includes('never-import-this-secret'));
  assert.ok(!JSON.stringify(createBackup({ ...fixture(), settings: backup.settings })).includes('never-import-this-secret'));
});
test('invalid files, future versions, duplicate IDs and broken relationships are rejected', () => {
  assert.throws(() => parseBackup('not JSON'), /JSON/);
  assert.throws(() => parseBackup('{}'), /ScholarTrail/);
  for (const mutate of [b => b.version = 2, b => b.backup_version = 2, b => b.projects.push(b.projects[0]), b => b.tags[0].project_id = 'missing', b => b.encounters[0].paper_id = 'missing', b => b.project_papers[0].tag_ids = ['missing'], b => b.project_papers[0].note = {}, b => b.projects[0].created_at = 'not a date']) {
    const backup = createBackup(fixture()); mutate(backup); assert.throws(() => parseBackup(JSON.stringify(backup)), /备份无法导入/);
  }
  assert.throws(() => parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1)), /20 MB/);
});
test('same-name copies get unique names across multiple changed backups', async () => {
  const source = fixture(), first = await planImport(blankDB(), json(source));
  source.project_papers[0].note = 'Revision two'; const second = await planImport(first.db, json(source));
  source.project_papers[0].note = 'Revision three'; const third = await planImport(second.db, json(source));
  assert.ok(third.db.projects.some(p => p.name === '文献综述（导入 2）'));
});
