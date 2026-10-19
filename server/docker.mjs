import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';

const exec = promisify(execFile);
export const IMAGE = process.env.JAVA_RUNNER_IMAGE || 'java-selection-runner:local';
export const CONTAINER_PREFIX = `java-selection-${process.pid}-`;

export async function sandboxReady() {
  try {
    await exec('docker', ['image', 'inspect', '--format', '{{.Id}}', IMAGE], { timeout: 3000 });
    return true;
  } catch { return false; }
}

function field(value) {
  const data = Buffer.from(value, 'utf8');
  const size = Buffer.alloc(4);
  size.writeInt32BE(data.length);
  return Buffer.concat([size, data]);
}

export async function runJava(prepared, input, signal) {
  const name = `${CONTAINER_PREFIX}${randomUUID()}`;
  let child;
  try {
    if (signal?.aborted) throw new Error('cancelled');
    // No source or host directories are mounted in the container. Code travels
    // through stdin, with no shell interpolation. A new filesystem per request.
    await exec('docker', ['create', '--name', name, '--pull=never', '--network=none',
      '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--pids-limit=64', '--memory=256m', '--memory-swap=256m', '--cpus=1',
      '--user=65534:65534', '--log-driver=none',
      '--tmpfs=/work:rw,nosuid,nodev,noexec,size=16m,mode=1777',
      '--tmpfs=/tmp:rw,nosuid,nodev,noexec,size=16m,mode=1777', '-i', IMAGE], { timeout: 10000 });
    if (signal?.aborted) throw new Error('cancelled');
    const payload = Buffer.concat([field(prepared.filename), field(prepared.mainClass), field(prepared.source), field(input)]);
    const output = await new Promise((resolve, reject) => {
      child = spawn('docker', ['start', '--attach', '--interactive', name], { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let bytes = 0;
      let failure;
      const stop = reason => {
        failure ||= reason;
        // Killing the Docker client alone does not stop its container.
        exec('docker', ['kill', name], { timeout: 3000 }).catch(() => {});
        child.kill();
      };
      const abort = () => stop(new Error('cancelled'));
      const timer = setTimeout(() => stop(new Error('sandbox_timeout')), 20000);
      signal?.addEventListener('abort', abort, { once: true });
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', data => {
        bytes += Buffer.byteLength(data);
        if (bytes > 512 * 1024) stop(new Error('sandbox_output_limit'));
        else stdout += data;
      });
      child.stderr.on('data', data => { if (stderr.length < 8192) stderr += data; });
      child.stdin.on('error', () => {}); // The container may fail before reading stdin.
      child.once('error', error => { failure ||= error; });
      child.once('close', code => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (failure) reject(failure);
        else if (code !== 0) reject(new Error(stderr || `Sandbox exited with code ${code}`));
        else resolve(stdout);
      });
      child.stdin.end(payload);
      if (signal?.aborted) abort();
    });
    const result = JSON.parse(output);
    const statuses = ['success', 'compile_error', 'runtime_error', 'timeout', 'output_limit', 'internal_error'];
    if (!statuses.includes(result.status) || typeof result.stdout !== 'string' || typeof result.stderr !== 'string') {
      throw new Error('Invalid sandbox response');
    }
    return { ...result, mode: prepared.mode };
  } finally {
    // Also cleans up stopped containers after compile errors, cancellation, etc.
    await exec('docker', ['rm', '--force', name], { timeout: 5000 }).catch(() => {});
  }
}
