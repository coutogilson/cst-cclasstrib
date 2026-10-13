# Consulta CST × cClassTrib (IBS/CBS)

Site estático de consulta aos **Códigos de Situação Tributária (CST)** e **Códigos de Classificação Tributária (cClassTrib)** do IBS/CBS, espelhando a página oficial do Portal da Conformidade Fácil (SEFAZ-RS).

Fonte oficial: <https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributaria>

## Uso online (GitHub Pages)

1. Suba este repositório para o GitHub como `cst-cclasstrib`.
2. Em **Settings → Pages**, selecione **Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. Acesse `https://<seu-usuario>.github.io/cst-cclasstrib/`.

## Uso local

Arquivos estáticos não funcionam bem via `file://` (o `fetch` do JSON é bloqueado). Sirva por HTTP:

```bash
cd cst-cclasstrib
python -m http.server 8000
# abrir http://localhost:8000
```

## Funcionalidades

- **Busca NCM (janela 1)** por CST, cClassTrib, NCM (7+ dígitos) ou palavras da descrição do produto — ex. `200003`, `medicamento`, `07082000`, `feijão` (singular/plural).
- **Busca NBS e serviços (janela 2, lado a lado)** por NBS (9 dígitos), palavra do serviço, IndOp, cClassTrib ou item da LC 116 — ex. `1.1502.10.00`, `desinfecção`, `030101`, `200029`, `saúde` — com paginação e exportação CSV própria.
- NCM/NBS com 7+ dígitos lista os cClassTrib vinculados nos anexos, com badge de origem na linha (`07082000 · PERMITIDO`; VEDADO em destaque vermelho). NCM válido sem vínculo exibe a descrição do produto mesmo assim.
- Descrição do produto NCM exibida acima dos resultados e no badge (fonte: https://silvioalbqrq.github.io/consulta-ncm/, `data/ncm-descricoes.json`).
- **Duas visões**: agrupada por CST ou aberta por cClassTrib.
- **Filtros** por CST, descrição, indicadores do CST, cClassTrib, tipo de alíquota, tributação regular / crédito presumido / estorno e DF-e aplicáveis (operador E/OU).
- **Detalhe** por código: vigência, percentuais de redução, DF-e, regra IBS/CBS, link da legislação e itens de anexo (NCM/NBS, carregados sob demanda).
- **Anexo VIII** — correlação Item LC 116 → NBS → PS Onerosa / Adq. Exterior / IndOp / Local de incidência → cClassTrib: seção própria de consulta, matriz de regra de incidência → IndOp, caixa de correlações na busca de NBS (9 dígitos) e no detalhe do cClassTrib.
- **Importação em lote de NCM** — cole uma lista de NCMs ou abra um arquivo CSV/TXT e receba a tabela cClassTrib de cada código: `NCM consultado · CST · cClassTrib · Descrição · Tipo alíq. · Redução · TR · CP · EC · DF-e · Anexos`. Exporta em **CSV** ou em **Excel (.xlsx)**, gerado no próprio navegador (OOXML/ZIP montado em JS, sem bibliotecas e sem enviar dado a servidor).
- **Exportação** do resultado filtrado em CSV (abre no Excel) e JSON.

## Estrutura

```
cst-cclasstrib/
├── index.html                  # página única
├── assets/
│   ├── styles.css              # visual base (sem frameworks)
│   ├── corporativo.css         # tema institucional VMF (marinho + dourado)
│   └── app.js                  # filtros, visões, detalhe, exportação e NCM em lote (vanilla JS)
├── data/
│   ├── resumo.json             # dataset enxuto carregado pelo app (~300 KB)
│   ├── ncm-nbs.json            # índice reverso NCM/NBS → cClassTribs (carga sob demanda)
│   ├── ncm-descricoes.json     # descrições NCM hierárquicas (carga sob demanda)
│   ├── anexo-viii.json         # correlação NBS × IndOp × cClassTrib do Anexo VIII (carga sob demanda)
│   ├── anexos/                 # fragmentos por cClassTrib (Detalhe baixa só o fragmento, em KB)
│   └── classificacao-tributaria.json  # snapshot completo, inclui anexos NCM/NBS (fallback do Detalhe)
└── scripts/
    ├── atualizar.py            # regenera os JSONs a partir da página oficial salva
    ├── atualizar_descricoes.py # regenera ncm-descricoes.json a partir do tipi-data.js
    ├── atualizar_anexo8.py     # regenera anexo-viii.json a partir da planilha do Anexo VIII
    ├── gerar_anexos.py         # fatia os anexos por cClassTrib em data/anexos/
    ├── test_dados.py           # regressão: contagens, cruzamentos, fragmentos, ASSET_V
    └── test_lote.mjs           # regressão: importação em lote de NCM → CSV/Excel
```

## Atualizar os dados

A página oficial embute o dataset completo em JavaScript (`var dadosOriginais`), então a atualização é determinística:

```bash
# 1. Abra a URL oficial no navegador e salve a página completa como portal.html
# 2. Rode:
python scripts/atualizar.py portal.html
# 3. Confira e commite data/resumo.json + data/classificacao-tributaria.json
```

Descrições NCM (fonte: https://silvioalbqrq.github.io/consulta-ncm/tipi-data.js):

```bash
# 1. Baixe o tipi-data.js do site consulta-ncm
# 2. Rode:
python scripts/atualizar_descricoes.py tipi-data.js
# 3. Confira e commite data/ncm-descricoes.json
```

Anexo VIII — correlação NBS × IndOp × cClassTrib (planilha do Anexo VIII, V1.01.00):

```bash
# 1. Salve a planilha do Anexo VIII (.xlsx)
# 2. Rode:
python scripts/atualizar_anexo8.py "AnexoVIII-CorrelacaoItemNBSIndOpCClassTrib_IBSCBS_V1.01.00.xlsx"
# 3. Confira e commite data/anexo-viii.json
```

Notas do Anexo VIII:
- `99.01.01` (“Outros serviços sem incidência de ISSQN/ICMS”) vem na planilha sem NBS/IndOp/cClassTrib e é descartado pelo script — por isso 207 itens com correlação em 208 grupos da aba.
- 15 correlações têm NBS vazio na própria planilha (ex. `07.13` pulverização → `200038`, `99.03.0x` imóveis → `200027`): alcançáveis só por descrição/IndOp, nunca por dígito NBS.
- `regraIndOp` (aba `REGRA inc. X`) é a matriz PS Onerosa × Adq. Exterior → IndOp exibida em “Regra de incidência → IndOp”; linhas sem IndOp (ex. N/S) são mantidas como lista vazia.
- Hierarquia de nomes: em divergência entre Portal (IT 1.70) e planilha (v1.01.00), prevalece o Portal — a UI avisa no detalhe. Divergências conhecidas: `200039`, `200042`, `200044`, `820001`, `820002` (ver `DIVERGENCIAS_CONHECIDAS` em `scripts/test_dados.py`).
- Detalhe baixa `data/anexos/<cod>.json` (KB, gerado por `scripts/gerar_anexos.py`); o snapshot completo só é usado como fallback.

Testes:

```bash
python scripts/test_dados.py     # datasets: contagens, cruzamentos, fragmentos, ASSET_V
node scripts/test_lote.mjs       # importação em lote: leitura, resolução, CSV e .xlsx
# CI (.github/workflows/ci.yml): node --check assets/app.js + os dois testes acima
```

Snapshot atual: **07/10/2026 (IT 2025.002 v1.70)** — 18 CSTs, 173 cClassTrib. Anexo VIII **V1.01.00 (08/10/2026)** — 1517 correlações, 731 NBS, 28 cClassTrib.

## Importação em lote de NCM

Painel no fim da página (aberto por padrão). Aceita lista colada ou arquivo `.csv`/`.txt`/`.tsv`.

Regras de leitura (tudo no navegador, nada é enviado a servidor):

- **Coluna explícita**: se a primeira linha tiver um cabeçalho `NCM` (ou `NCM consultado`, `Código NCM`, `Cod NCM`), o delimitador (`;`, TAB, `,` ou `|`) é detectado e só aquela coluna é lida — as demais colunas numéricas do arquivo são ignoradas.
- **Sem cabeçalho**: os códigos são extraídos do próprio texto. Se existir algum código de 7+ dígitos, só os de 7+ dígitos entram (evita capturar quantidade, valor, data); se não houver nenhum, prefixos de 4–8 dígitos valem (ex.: `0901` → todos os NCM do capítulo).
- Códigos repetidos contam uma vez; a ordem da lista é preservada. Tetos: 5.000 NCMs por importação e 20.000 linhas na saída.
- NCM com vínculo nos anexos rende **uma linha por cClassTrib**; NCM válido sem vínculo entra com a descrição do produto e as demais colunas vazias; código desconhecido entra só com o código.
- A coluna **Anexos** é a mesma contagem `qtdAnexos` da tabela principal. A permissão do vínculo (`PERMITIDO`/`VEDADO`) aparece como selo ao lado do NCM na tela, mas não faz parte das colunas exportadas.

Exportação: **CSV** (`;` + BOM UTF-8, abre no Excel) e **Excel .xlsx** — planilha OOXML montada em JS (header congelado e em negrito, `CST`/`cClassTrib` como texto para preservar zeros à esquerda, `Anexos` numérico). Sem bibliotecas externas; usa `CompressionStream` quando o navegador tem, senão ZIP sem compressão.

## Aviso

Consulta **não oficial**, sem vínculo com SEFAZ/Receita Federal. Para fins fiscais, confirme sempre no portal oficial.
