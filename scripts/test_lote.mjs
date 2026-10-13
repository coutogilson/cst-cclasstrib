/* Teste de regressão da importação de NCM em lote (importa CSV/texto, exporta CSV/Excel).
 *
 * Roda as funções reais de assets/app.js num contexto vm com DOM mínimo,
 * sobre os datasets de data/, e confere parsing, resolução contra o índice,
 * CSV e a planilha .xlsx (ZIP/OOXML) gerada em JS.
 *
 * Uso: node scripts/test_lote.mjs   (exit 1 se qualquer invariante quebrar)
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(REPO, "data");
const ler = (p) => JSON.parse(fs.readFileSync(path.join(DATA, p), "utf8"));

const falhas = [];
const ok = (nome, cond, extra = "") => {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${extra ? "  " + extra : ""}`);
  if (!cond) falhas.push(nome);
};

/* ---------- contexto: app.js real, com DOM e download capturados ---------- */
const capturado = {};
const elFalso = () => ({
  value: "", innerHTML: "", textContent: "", disabled: false, hidden: false,
  style: {}, dataset: {}, open: true,
  appendChild() {}, addEventListener() {}, click() {}, remove() {}, focus() {},
  querySelectorAll: () => [], classList: { add() {}, remove() {} },
});
const doc = {
  addEventListener() {}, getElementById: (id) => (doc._els[id] ||= elFalso()),
  querySelector: () => elFalso(), querySelectorAll: () => [],
  createElement: () => elFalso(), body: { appendChild() {} },
  _els: {},
};

const ctx = {
  document: doc, console,
  URL: { createObjectURL: (b) => { capturado.blob = b; return "blob:teste"; }, revokeObjectURL() {} },
  setTimeout, clearTimeout, isFinite, TextEncoder, Blob, Response,
};
ctx.window = ctx;
if (typeof CompressionStream !== "undefined") ctx.CompressionStream = CompressionStream;

const ganchos = `
;globalThis.__api = {
  extrairNcms, montarLote, exportarLoteCSV, exportarLoteXLSX, dividirLinha, LOTE_HEAD,
  getLote: () => LOTE,
  getIdx: () => IDX,
  setDados: (idx, data, desc) => {
    IDX = idx; DATA = data; NCM_DESC = desc; IDX_KEYS = null;
    MAP_CCT.clear();
    for (const p of DATA) for (const f of p.ClassificacoesTributarias) MAP_CCT.set(f.CodClassTrib, { pai: p, filho: f });
  },
};`;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(REPO, "assets", "app.js"), "utf8") + ganchos, ctx);

const api = ctx.__api;
api.setDados(ler("ncm-nbs.json"), ler("resumo.json"), ler("ncm-descricoes.json"));

/* ---------- 1. leitura da entrada ---------- */
const entradas = [
  ["texto, uma por linha", "07082000\n10062010\n30049099", ["07082000", "10062010", "30049099"]],
  ["separado por vírgula/ponto e vírgula", "07082000, 10062010;30049099", ["07082000", "10062010", "30049099"]],
  ["NCM pontuado (0708.20.00)", "0708.20.00", ["07082000"]],
  ["repetidos contam uma vez", "07082000\n07082000", ["07082000"]],
  ["CSV com cabeçalho NCM (;)", "NCM;Descrição\n07082000;Café\n10062010;Arroz", ["07082000", "10062010"]],
  ["CSV com cabeçalho (,) ", "NCM,Produto\n07082000,Café", ["07082000"]],
  ["CSV com cabeçalho (TAB)", "NCM\tProduto\n07082000\tCafé", ["07082000"]],
  ["CSV com cabeçalho acentuado", "Código NCM;Descrição\n07082000;Café", ["07082000"]],
  ["CSV ignora outras colunas numéricas", "NCM;Qtd;Preço\n07082000;12;19.9\n10062010;3;7", ["07082000", "10062010"]],
  ["CSV sem cabeçalho", "07082000;2\n10062010;5", ["07082000", "10062010"]],
  ["CSV com aspas e ';' dentro do campo", 'NCM;"Descrição; longa"\n07082000;"Café; torrado"', ["07082000"]],
  ["CSV com coluna NCM fora da primeira posição", "Produto;NCM\nCafé;07082000", ["07082000"]],
  ["prefixos de 4 dígitos (sem código completo)", "0901\n0902", ["0901", "0902"]],
  ["havendo código completo, ignora número solto", "0901;quantidade 3\n07082000", ["07082000"]],
  ["texto corrido", "consultar NCM 07082000 e 10062010, volume 250", ["07082000", "10062010"]],
  ["vazio", "   \n\t ", []],
  ["sem dígito algum", "café, arroz e feijão", []],
];
for (const [nome, entrada, esperado] of entradas) {
  const obtido = api.extrairNcms(entrada);
  ok(`leitura: ${nome}`, JSON.stringify(obtido) === JSON.stringify(esperado), `→ ${JSON.stringify(obtido)}`);
}

/* ---------- 2. resolução contra o índice reverso ---------- */
api.montarLote(api.extrairNcms("07082000\n99999999"));
const L = api.getLote();
const doCafe = L.linhas.filter((l) => l.ncm === "07082000");
const esperadoCafe = api.getIdx().codes["07082000"].ref.map((r) => r[1]);
ok("resolução: uma linha por vínculo do índice",
  JSON.stringify(doCafe.map((l) => l.cod)) === JSON.stringify(esperadoCafe),
  `${doCafe.map((l) => l.cod).join(",")} x ${esperadoCafe.join(",")}`);
ok("resolução: linha traz CST, descrição, tipo, redução, TR/CP/EC e DF-e",
  doCafe.every((l) => l.cst && l.desc && l.tipo && l.red && l.tr && l.cp && l.ec && l.dfe),
  JSON.stringify(doCafe[0] || {}));
ok("resolução: anexos é a contagem qtdAnexos", doCafe.every((l) => Number.isInteger(l.anexos) && l.anexos >= 0));
ok("resolução: código desconhecido entra como uma linha só",
  L.linhas.filter((l) => l.ncm === "99999999").length === 1 && L.naoEncontrado === 1);

api.montarLote(api.extrairNcms("01012100"));
const semVinculo = api.getLote().linhas.find((l) => l.nota === "sem vínculo nos anexos");
ok("resolução: NCM válido sem vínculo entra com a descrição do produto",
  !!semVinculo && !!semVinculo.desc && semVinculo.cod === "", semVinculo ? semVinculo.desc.slice(0, 60) : "nenhum");

api.montarLote(api.extrairNcms("0901"));
ok("resolução: prefixo expande para vários NCM", new Set(api.getLote().linhas.map((l) => l.ncm)).size > 1);

/* ---------- 3. CSV ---------- */
api.montarLote(api.extrairNcms("07082000\n10062010\n30049099\n99999999"));
const totalLinhas = api.getLote().linhas.length;
api.exportarLoteCSV();
const csvBytes = Buffer.from(await capturado.blob.arrayBuffer());
const csv = csvBytes.toString("utf8");
const linhasCsv = csv.replace(/^\uFEFF/, "").split("\r\n");
ok("csv: BOM UTF-8", csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf);
ok("csv: cabeçalho pedido", linhasCsv[0] === "NCM consultado;CST;cClassTrib;Descrição;Tipo alíq.;Redução;TR;CP;EC;DF-e;Anexos", linhasCsv[0]);
ok("csv: uma linha por vínculo", linhasCsv.length === totalLinhas + 1, `${linhasCsv.length - 1} x ${totalLinhas}`);
ok("csv: todas as linhas com 11 colunas",
  linhasCsv.every((l) => api.dividirLinha(l, ";").length === 11));
ok("csv: identificadores preservados como texto",
  linhasCsv.slice(1).every((l) => /^"?\d{8}"?;/.test(l)), linhasCsv[1]);

/* ---------- 4. planilha .xlsx (OOXML montado em JS) ---------- */
await api.exportarLoteXLSX();
const xlsx = Buffer.from(await capturado.blob.arrayBuffer());
ok("xlsx: assinatura ZIP (PK)", xlsx.subarray(0, 2).toString("ascii") === "PK");
ok("xlsx: content-type de planilha", capturado.blob.type.includes("spreadsheetml.sheet"));

function lerZip(buf) {
  const arq = {};
  let p = 0;
  while (p + 30 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const metodo = buf.readUInt16LE(p + 8);
    const tamComprimido = buf.readUInt32LE(p + 18);
    const tamNome = buf.readUInt16LE(p + 26);
    const tamExtra = buf.readUInt16LE(p + 28);
    const nome = buf.subarray(p + 30, p + 30 + tamNome).toString("utf8");
    const ini = p + 30 + tamNome + tamExtra;
    const dados = buf.subarray(ini, ini + tamComprimido);
    arq[nome] = metodo === 8 ? zlib.inflateRawSync(dados) : Buffer.from(dados);
    p = ini + tamComprimido;
  }
  return arq;
}

const partes = lerZip(xlsx);
const obrigatorios = ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml",
  "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"];
ok("xlsx: pacote OOXML completo", obrigatorios.every((n) => partes[n] && partes[n].length),
  `${Object.keys(partes).length} partes`);

const aba = partes["xl/worksheets/sheet1.xml"].toString("utf8");
const linhasPlanilha = (aba.match(/<row /g) || []).length;
ok("xlsx: uma linha por resultado + cabeçalho", linhasPlanilha === totalLinhas + 1,
  `${linhasPlanilha} x ${totalLinhas + 1}`);
ok("xlsx: cabeçalho na planilha", aba.includes("NCM consultado") && aba.includes("cClassTrib") && aba.includes("Anexos"));
ok("xlsx: cabeçalho congelado", aba.includes('state="frozen"'));
ok("xlsx: sem valor inválido (NaN/undefined)", !/NaN|undefined/.test(aba));
ok("xlsx: identificadores como texto (inlineStr)",
  aba.includes('<c r="B2" t="inlineStr"') && aba.includes('<c r="C2" t="inlineStr"'));
ok("xlsx: Anexos como número", /<c r="K2"><v>\d+<\/v><\/c>/.test(aba), (aba.match(/<c r="K2".*?<\/c>/) || [""])[0]);
ok("xlsx: nome da aba", partes["xl/workbook.xml"].toString("utf8").includes('name="NCM x cClassTrib"'));

/* ---------- 5. planilha grande (limites e tempo) ---------- */
const reais = Object.keys(api.getIdx().codes).filter((c) => c.length === 8).slice(0, 900);
api.montarLote(api.extrairNcms(reais.join("\n")));
const linhasGrande = api.getLote().linhas.length;
const t0 = Date.now();
await api.exportarLoteXLSX();
const grande = Buffer.from(await capturado.blob.arrayBuffer());
const ms = Date.now() - t0;
const abag = lerZip(grande)["xl/worksheets/sheet1.xml"].toString("utf8");
ok("xlsx grande: todas as linhas exportadas",
  (abag.match(/<row /g) || []).length === linhasGrande + 1, `${linhasGrande} linhas em ${ms} ms`);
ok("xlsx grande: geração abaixo de 5 s", ms < 5000, `${ms} ms, ${(grande.length / 1024).toFixed(0)} KB`);

console.log(falhas.length ? `\n${falhas.length} falha(s): ${falhas.join(", ")}` : "\nTudo certo.");
process.exit(falhas.length ? 1 : 0);
