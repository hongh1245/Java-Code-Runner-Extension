import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

// The trusted harness runs inside the disposable container, never on the host.
public class Runner {
    static final int OUTPUT_LIMIT = 32768;
    record Result(String status, String stdout, String stderr, Integer exitCode) {}

    static String readField(DataInputStream in, int limit) throws IOException {
        int size = in.readInt();
        if (size < 0 || size > limit) throw new IOException("Invalid request size");
        byte[] bytes = in.readNBytes(size);
        if (bytes.length != size) throw new EOFException();
        return new String(bytes, StandardCharsets.UTF_8);
    }

    static class Capture implements Runnable {
        final InputStream stream;
        final Process process;
        final AtomicBoolean exceeded;
        final ByteArrayOutputStream data = new ByteArrayOutputStream();
        Capture(InputStream stream, Process process, AtomicBoolean exceeded) {
            this.stream = stream;
            this.process = process;
            this.exceeded = exceeded;
        }
        public void run() {
            try (stream) {
                byte[] buffer = new byte[4096];
                int n;
                while ((n = stream.read(buffer)) != -1) {
                    int remaining = OUTPUT_LIMIT - data.size();
                    data.write(buffer, 0, Math.min(n, remaining));
                    if (n > remaining) {
                        exceeded.set(true);
                        process.destroyForcibly();
                        break;
                    }
                }
            } catch (IOException ignored) { /* A terminated process closes its pipes. */ }
        }
        String text() { return data.toString(StandardCharsets.UTF_8); }
    }

    static Result execute(List<String> command, String input, int seconds) throws Exception {
        Process process = new ProcessBuilder(command).directory(new File("/work")).start();
        AtomicBoolean exceeded = new AtomicBoolean();
        Capture out = new Capture(process.getInputStream(), process, exceeded);
        Capture err = new Capture(process.getErrorStream(), process, exceeded);
        Thread outThread = Thread.ofVirtual().start(out);
        Thread errThread = Thread.ofVirtual().start(err);
        Thread writer = Thread.ofVirtual().start(() -> {
            try (OutputStream stream = process.getOutputStream()) {
                stream.write(input.getBytes(StandardCharsets.UTF_8));
            } catch (IOException ignored) { /* Programs may exit without reading stdin. */ }
        });
        boolean finished = process.waitFor(seconds, TimeUnit.SECONDS);
        if (!finished || exceeded.get()) {
            process.descendants().forEach(ProcessHandle::destroyForcibly);
            process.destroyForcibly();
            process.waitFor(2, TimeUnit.SECONDS);
        }
        outThread.join(1000);
        errThread.join(1000);
        writer.join(100);
        String status = exceeded.get() ? "output_limit" : !finished ? "timeout"
            : process.exitValue() == 0 ? "success" : "runtime_error";
        return new Result(status, out.text(), err.text(), finished ? process.exitValue() : null);
    }

    static String json(String value) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : value.toCharArray()) {
            switch (c) {
                case '"' -> b.append("\\\"");
                case '\\' -> b.append("\\\\");
                case '\n' -> b.append("\\n");
                case '\r' -> b.append("\\r");
                case '\t' -> b.append("\\t");
                default -> {
                    if (c < 32) b.append(String.format("\\u%04x", (int)c));
                    else b.append(c);
                }
            }
        }
        return b.append('"').toString();
    }

    public static void main(String[] args) {
        long start = System.nanoTime();
        Result result;
        String diagnostics = "";
        try {
            DataInputStream in = new DataInputStream(System.in);
            String filename = readField(in, 256);
            String mainClass = readField(in, 1024);
            String source = readField(in, 40000);
            String input = readField(in, 8192);
            if (!filename.matches("[\\p{javaJavaIdentifierStart}][\\p{javaJavaIdentifierPart}]*\\.java") ||
                !mainClass.matches("[\\p{javaJavaIdentifierStart}][\\p{javaJavaIdentifierPart}]*(\\.[\\p{javaJavaIdentifierStart}][\\p{javaJavaIdentifierPart}]*)*")) {
                throw new IOException("Invalid Java class name");
            }
            Files.createDirectories(Path.of("/work/classes"));
            Path file = Path.of("/work", filename);
            Files.writeString(file, source, StandardCharsets.UTF_8);
            result = execute(List.of("javac", "-J-Xmx96m", "-J-XX:ActiveProcessorCount=1",
                "-J-XX:+UseSerialGC", "-proc:none", "-encoding", "UTF-8", "-d", "/work/classes", file.toString()), "", 8);
            diagnostics = result.stderr() + result.stdout();
            if (result.status().equals("success")) {
                result = execute(List.of("java", "-Xmx96m", "-XX:ActiveProcessorCount=1", "-XX:+UseSerialGC",
                    "-Dfile.encoding=UTF-8", "-cp", "/work/classes", mainClass), input, 3);
            } else if (result.status().equals("runtime_error")) {
                result = new Result("compile_error", "", "", result.exitCode());
            }
        } catch (Exception e) {
            result = new Result("internal_error", "", "Runner could not complete the request.", null);
        }
        long duration = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
        System.out.print("{\"status\":" + json(result.status()) + ",\"stdout\":" + json(result.stdout()) +
            ",\"stderr\":" + json(result.stderr()) + ",\"compileOutput\":" + json(diagnostics) +
            ",\"exitCode\":" + result.exitCode() + ",\"durationMs\":" + duration + "}");
    }
}
