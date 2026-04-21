# Rotina

Checklist diario pessoal com treino, agua, sono e historico local.

## Uso

- Salva o dia atual no navegador.
- Reseta ao virar o dia e guarda o historico.
- Mostra meses anteriores em calendario por cores:
  - vermelho: abaixo de 30%
  - laranja: 30% a 49%
  - amarelo: 50% a 79%
  - verde: 80% a 100%
- Funciona offline depois da primeira visita.

## Comandos

```bash
npm run dev
npm run build
npm run preview
```

## Build

```bash
npm run build
```

Gera `dist/` com tudo pronto para deploy estatico.

## Preview

```bash
npm run preview
```

Abre em `http://localhost:4173`.

## Dev

```bash
npm run dev
```

Abre em `http://localhost:4173` servindo a raiz do projeto.

## GitHub + Vercel

O projeto ja esta preparado para esse fluxo:

- `.gitignore` ignora `node_modules/`, `dist/` e `.vercel/`
- `vercel.json` define:
  - `buildCommand: npm run build`
  - `outputDirectory: dist`

Fluxo:

1. Criar um repo privado no GitHub.
2. Adicionar o remoto aqui.
3. Fazer o primeiro push.
4. Importar o repo no Vercel.
5. O Vercel vai usar `npm run build` e publicar `dist/`.

## PWA

- Android/Chrome: instalar pelo navegador.
- iPhone/Safari: compartilhar -> adicionar a tela de inicio.

## Validacao local

- `npm run build`
- preview local em `http://localhost:4173`
- captura visual da tela principal e do historico
