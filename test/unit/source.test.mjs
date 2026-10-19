import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareSource } from '../../server/source.mjs';

test('keeps the user example as Test.java', () => {
  const source = readFileSync(new URL('../../examples/Test.java', import.meta.url), 'utf8');
  const result = prepareSource(source);
  assert.equal(result.filename, 'Test.java');
  assert.equal(result.mainClass, 'Test');
  assert.equal(result.source, source);
});
test('ignores class and package keywords inside comments and literals', () => {
  const result = prepareSource(`/* public class Wrong {} */
package lessons;
public final class Actual {
  String s = "public class Fake {}";
  String t = """
  public class AlsoFake {}
  """;
  public static void main(String[] args) {}
}`);
  assert.equal(result.filename, 'Actual.java');
  assert.equal(result.mainClass, 'lessons.Actual');
});
test('chooses the entry class when a helper class appears first', () => {
  const result = prepareSource('class Helper {} public class Entry { public static void main(String[] args) {} }');
  assert.equal(result.filename, 'Entry.java');
  assert.equal(result.mainClass, 'Entry');
});
test('does not interpret a class literal as a declaration', () => {
  const result = prepareSource('System.out.println(String.class.getSimpleName());');
  assert.equal(result.mode, 'snippet');
});
test('wraps statements while retaining imports and non-breaking spaces', () => {
  const result = prepareSource('import java.util.Scanner;\nint\u00a0n = new Scanner(System.in).nextInt(); System.out.println(n);');
  assert.equal(result.mode, 'snippet');
  assert.match(result.source, /^import java.util.Scanner;\npublic class Main/);
  assert.match(result.source, /int n/);
});
test('rejects blank and oversized sources including UTF-8 byte size', () => {
  assert.throws(() => prepareSource('  '), /選取/);
  assert.throws(() => prepareSource('字'.repeat(12000)), /32 KB/);
});
test('preserves non-breaking spaces inside string literals', () => {
  const result = prepareSource('System.out.println("a\u00a0b");');
  assert.ok(result.source.includes('"a\u00a0b"'));
});
