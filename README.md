# Gabriel Carbinatto — Portfólio

Portfólio estático, em inglês, para análise, ciência e visualização de dados. A interface usa fundo preto, tipografia bege e uma linguagem expositiva. A abertura atual é estritamente tipográfica.

- As seções de perfil foram preenchidas a partir do currículo exportado do LinkedIn fornecido no projeto.
- O experimento visual feito com Hairline e Anatomy foi retirado da página enquanto a direção da abertura é redefinida; as cópias locais auditadas permanecem no repositório para uso futuro.
- Nenhum projeto profissional foi inventado; a área de cases permanece como placeholder.

## Executar localmente

O site atual não possui dependências de runtime e pode ser aberto diretamente. Para testar com um servidor local:

```bash
python3 -m http.server 8000
```

Depois acesse `http://localhost:8000`.

## Experimento visual arquivado

```bash
node tools/anatomy/build-data-reads.mjs
```

O comando recria `assets/data-reads.svg`. Essa figura não é carregada pela página atual e permanece apenas como material de exploração para uma futura abertura.

## Dependências auditadas

As dependências foram fixadas em cópias locais para evitar CDN e alterações externas inesperadas:

- `vendor/hairline/index.js`: distribuição de `@lucasmarkes/hairline@0.5.1`.
- `tools/anatomy/iso-kit.mjs`: kit do Anatomy no commit `1482e8469b0a9e0d8cc18ea2740a01423d29ae80`.
- Licenças MIT estão ao lado de cada cópia.

Os scripts opcionais de publicação e leitura de sessões do Anatomy não foram incluídos nem executados.

## Estrutura

```text
work-gallery/
├── assets/
│   ├── gabriel-carbinatto.jpeg
│   └── data-reads.svg
├── tools/anatomy/
│   ├── build-data-reads.mjs
│   ├── iso-kit.mjs
│   └── LICENSE
├── vendor/hairline/
│   ├── index.js
│   └── LICENSE
├── README.md
└── index.html
```

O projeto pode ser publicado diretamente no GitHub Pages pela raiz da branch principal.
