# Work Gallery

Portfólio criativo estático construído em torno de uma maquete vetorial 3D de um pequeno atelier. Cada detalhe visual está no próprio `index.html`, usando apenas HTML, CSS, SVG inline e JavaScript — sem imagens rasterizadas, dependências ou etapa de build.

## Executar localmente

Você pode abrir `index.html` diretamente no navegador ou iniciar um servidor local:

```bash
python3 -m http.server 8000
```

Depois, acesse `http://localhost:8000`.

## Personalizar

Todo o conteúdo está em `index.html`. Antes de publicar, procure e substitua:

- `hello@example.com` pelo seu e-mail;
- nomes, descrições e links dos projetos;
- o texto principal e a disponibilidade profissional;
- cores no bloco `:root` do CSS, se desejar.

## Publicar com GitHub Desktop

1. Abra o GitHub Desktop.
2. Escolha **File → Add Local Repository**.
3. Selecione a pasta `work-gallery`.
4. Clique em **Publish repository**.
5. No GitHub, abra **Settings → Pages**.
6. Em **Build and deployment**, selecione **Deploy from a branch**.
7. Escolha a branch `main`, a pasta `/ (root)` e clique em **Save**.

O arquivo `.nojekyll` garante que o GitHub Pages publique os arquivos estáticos diretamente.

## Estrutura

```text
work-gallery/
├── .gitignore
├── .nojekyll
├── README.md
└── index.html
```
