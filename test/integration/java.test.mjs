import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runJava, sandboxReady, CONTAINER_PREFIX } from '../../server/docker.mjs';
import { prepareSource } from '../../server/source.mjs';

const sample = readFileSync(new URL('../../examples/Test.java', import.meta.url), 'utf8');
const run = (code, input = '', signal) => runJava(prepareSource(code), input, signal);

test('Java sandbox image is built and Docker is available', async () => assert.equal(await sandboxReady(), true));
test('user example prints Third Exception', async () => {
  const result = await run(sample);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.equal(result.stdout, 'Third Exception\n');
  assert.equal(result.exitCode, 0);
});
test('division by zero follows the inner ArithmeticException catch', async () => {
  const result = await run(sample.replace('{ 0, 200 }', '{ 0, 200, 0 }'));
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.equal(result.stdout, 'First Exception\n');
});
test('supports packaged classes, Unicode output and standard input', async () => {
  const result = await run('package demo; import java.util.*; public class Input { public static void main(String[] args) { System.out.println("答案：" + new Scanner(System.in).nextInt() * 2); } }', '21\n');
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.equal(result.stdout, '答案：42\n');
});
test('statement snippets and class literals are executed', async () => {
  const result = await run('System.out.println(String.class.getSimpleName());');
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.equal(result.stdout, 'String\n');
});
test('compilation failures are distinct from runtime exceptions', async () => {
  const compile = await run('System.out.println(missingVariable);');
  assert.equal(compile.status, 'compile_error');
  assert.match(compile.compileOutput, /cannot find symbol/);
  const runtime = await run('throw new IllegalStateException("test failure");');
  assert.equal(runtime.status, 'runtime_error');
  assert.match(runtime.stderr, /IllegalStateException: test failure/);
});
test('infinite loops time out; unbounded output is capped', async () => {
  const timeout = await run('while (true) {}');
  assert.equal(timeout.status, 'timeout', JSON.stringify(timeout));
  const output = await run('while (true) { System.out.println("x".repeat(1000)); }');
  assert.equal(output.status, 'output_limit');
  assert.ok(Buffer.byteLength(output.stdout) <= 32768);
});
test('sandbox blocks external networking and writes outside tmpfs', async () => {
  const result = await run(`try { java.nio.file.Files.writeString(java.nio.file.Path.of("/not-allowed"), "x"); System.out.println("BAD_WRITE"); }
catch (java.io.IOException e) { System.out.println("WRITE_BLOCKED"); }
try (var socket = new java.net.Socket()) { socket.connect(new java.net.InetSocketAddress("1.1.1.1", 80), 500); System.out.println("BAD_NETWORK"); }
catch (java.io.IOException e) { System.out.println("NETWORK_BLOCKED"); }`);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.equal(result.stdout, 'WRITE_BLOCKED\nNETWORK_BLOCKED\n');
});
test('aborting a request stops and removes its container', async () => {
  const controller = new AbortController();
  const pending = run('while (true) {}', '', controller.signal);
  const timer = setTimeout(() => controller.abort(), 1200);
  try { await assert.rejects(pending, /cancelled/); } finally { clearTimeout(timer); }
});
after(() => {
  const containers = execFileSync('docker', ['ps', '-aq', '--filter', `name=${CONTAINER_PREFIX}`], { encoding: 'utf8' }).trim();
  assert.equal(containers, '', 'Execution containers must be removed after every outcome.');
});
