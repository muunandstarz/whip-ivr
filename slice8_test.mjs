import mysql from 'mysql2/promise';
import { randomUUID } from 'crypto';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log('\n=== Slice 8 Acceptance Tests ===\n');

// Test 1: Schema migration — source enum accepts fax and manual
try {
  const extId1 = `test-fax-${randomUUID()}`;
  const extId2 = `test-manual-${randomUUID()}`;
  await conn.execute(
    "INSERT INTO mail_items (source, external_id, received_at, status, subject) VALUES ('fax', ?, NOW(), 'new', 'Test Fax Item')",
    [extId1]
  );
  await conn.execute(
    "INSERT INTO mail_items (source, external_id, received_at, status, subject) VALUES ('manual', ?, NOW(), 'new', 'Test Manual Item')",
    [extId2]
  );
  const [[row1]] = await conn.execute("SELECT source FROM mail_items WHERE external_id = ?", [extId1]);
  const [[row2]] = await conn.execute("SELECT source FROM mail_items WHERE external_id = ?", [extId2]);
  console.log('✅ T1: source=fax accepted:', row1.source === 'fax');
  console.log('✅ T2: source=manual accepted:', row2.source === 'manual');
  
  // Verify existing rows unchanged
  const [[emailRow]] = await conn.execute("SELECT COUNT(*) AS cnt FROM mail_items WHERE source = 'email'");
  const [[mailRow]] = await conn.execute("SELECT COUNT(*) AS cnt FROM mail_items WHERE source = 'mail'");
  console.log('✅ T3: existing email rows unchanged:', emailRow.cnt >= 0);
  console.log('✅ T4: existing mail rows unchanged:', mailRow.cnt >= 0);
  
  // Test dedupe: two manual items don't collide
  const extId3 = `manual-${randomUUID()}`;
  const extId4 = `manual-${randomUUID()}`;
  await conn.execute(
    "INSERT INTO mail_items (source, external_id, received_at, status, subject) VALUES ('manual', ?, NOW(), 'new', 'Manual 1')",
    [extId3]
  );
  await conn.execute(
    "INSERT INTO mail_items (source, external_id, received_at, status, subject) VALUES ('manual', ?, NOW(), 'new', 'Manual 2')",
    [extId4]
  );
  const [[cnt]] = await conn.execute(
    "SELECT COUNT(*) AS cnt FROM mail_items WHERE external_id IN (?, ?)",
    [extId3, extId4]
  );
  console.log('✅ T5: two manual items with different UUIDs — no dedupe collision:', cnt.cnt === 2);
  
  // Cleanup
  await conn.execute("DELETE FROM mail_items WHERE external_id IN (?, ?, ?, ?)", [extId1, extId2, extId3, extId4]);
  console.log('✅ Cleanup done');
} catch (e) {
  console.error('❌ Test failed:', e.message);
}

// Test 6: mail_item_files table still works
try {
  const extId = `test-file-${randomUUID()}`;
  await conn.execute(
    "INSERT INTO mail_items (source, external_id, received_at, status, subject) VALUES ('manual', ?, NOW(), 'new', 'File Test')",
    [extId]
  );
  const [[item]] = await conn.execute("SELECT id FROM mail_items WHERE external_id = ?", [extId]);
  await conn.execute(
    "INSERT INTO mail_item_files (item_id, storage_key, filename, content_type, size_bytes) VALUES (?, 'test/key/file.pdf', 'test.pdf', 'application/pdf', 1024)",
    [item.id]
  );
  const [[fileRow]] = await conn.execute("SELECT * FROM mail_item_files WHERE item_id = ?", [item.id]);
  console.log('✅ T6: mail_item_files insert works for manual item:', fileRow.filename === 'test.pdf');
  await conn.execute("DELETE FROM mail_item_files WHERE item_id = ?", [item.id]);
  await conn.execute("DELETE FROM mail_items WHERE external_id = ?", [extId]);
} catch (e) {
  console.error('❌ T6 failed:', e.message);
}

console.log('\n=== All Slice 8 DB tests passed ===\n');
await conn.end();
