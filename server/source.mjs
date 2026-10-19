export const MAX_CODE_BYTES = 32 * 1024;
export const MAX_INPUT_BYTES = 8 * 1024;

// Mask literals and comments without moving offsets or line numbers. Braces and
// keywords inside strings, text blocks or comments must not select a class.
export function maskJava(source) {
  return source.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"""[\s\S]*?(?<!\\)"""|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g,
    match => match.replace(/[^\n\r]/g, ' '));
}

export function prepareSource(code) {
  if (typeof code !== 'string' || !code.trim()) throw new Error('請先選取 Java 程式碼。');
  if (Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) throw new Error('程式碼上限為 32 KB，請縮小選取範圍。');
  code = code.replace(/^\uFEFF/, '');
  const originalMask = maskJava(code);
  code = code.replace(/\u00a0/g, (value, index) => originalMask[index] === '\u00a0' ? ' ' : value);
  const masked = maskJava(code);
  const tokens = [...masked.matchAll(/[\p{ID_Start}_$][\p{ID_Continue}$]*|[{};.]/gu)];
  let depth = 0;
  let segmentStart = 0;
  const types = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i][0];
    if (depth === 0 && ['class', 'interface', 'enum', 'record'].includes(token) &&
        tokens[i - 1]?.[0] !== '.' && tokens[i + 1]) {
      const name = tokens[i + 1][0];
      if (/^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u.test(name)) {
        types.push({ name, index: tokens[i].index,
          isPublic: /\bpublic\b/.test(masked.slice(segmentStart, tokens[i].index)) });
      }
    }
    if (token === '{') depth++;
    if (token === '}') { depth--; if (depth === 0) segmentStart = tokens[i].index + 1; }
    if (token === ';' && depth === 0) segmentStart = tokens[i].index + 1;
  }
  if (!types.length) {
    // Statement snippets may include imports; compilation diagnostics still refer
    // to the generated Main.java, whose first two lines are the wrapper.
    let imports = '';
    let body = code;
    const declarations = [...masked.matchAll(/\bimport\s+(?:static\s+)?[\w$.*\s]+;/g)];
    for (const match of declarations.reverse()) {
      imports = code.slice(match.index, match.index + match[0].length) + '\n' + imports;
      body = body.slice(0, match.index) + match[0].replace(/[^\n]/g, ' ') + body.slice(match.index + match[0].length);
    }
    return { filename: 'Main.java', mainClass: 'Main', mode: 'snippet',
      source: `${imports}public class Main {\npublic static void main(String[] args) throws Exception {\n${body}\n}\n}\n` };
  }
  const publicType = types.find(type => type.isPublic) || types[0];
  const mainType = types.find((type, i) => /\b(?:public\s+static|static\s+public)\s+(?:final\s+)?void\s+main\s*\(/
    .test(masked.slice(type.index, types[i + 1]?.index))) || publicType;
  const packageName = masked.match(/\bpackage\s+([\p{ID_Start}_$][\p{ID_Continue}$.\s]*)\s*;/u)?.[1].replace(/\s/g, '');
  return { filename: `${publicType.name}.java`, mainClass: packageName ? `${packageName}.${mainType.name}` : mainType.name,
    mode: 'class', source: code };
}
