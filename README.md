# Echo

Plataforma de tradução em tempo real de texto e voz, desenvolvida com foco em comunicação multilíngue e expansão futura para recursos de acessibilidade.

## Sobre o projeto

O Echo é uma aplicação criada com o objetivo de facilitar a comunicação entre pessoas que falam idiomas diferentes.

O projeto surgiu inicialmente como uma proposta acadêmica e conquistou o 1º lugar em uma competição realizada em 2025. Em 2026, a ideia foi retomada e evoluída para uma primeira versão funcional.

Atualmente, o Echo permite realizar traduções de texto e utilizar entrada de áudio por microfone, buscando oferecer uma experiência de comunicação mais dinâmica e próxima do tempo real.

A proposta de evolução do projeto inclui o desenvolvimento de novos recursos de acessibilidade e, principalmente, a futura integração com LIBRAS.

## Funcionalidades atuais

- Tradução de texto entre diferentes idiomas
- Seleção de idioma de origem e destino
- Entrada de áudio pelo microfone
- Processamento de áudio no navegador
- Tradução utilizando modelo de inteligência artificial
- Interface web responsiva
- Estrutura preparada para evolução do projeto

## Tecnologias utilizadas

- Next.js
- TypeScript
- React
- Tailwind CSS
- NLLB-200
- Transformers.js
- WebAssembly
- AudioWorklet
- Web Audio API

## Inteligência Artificial

O Echo utiliza o modelo NLLB-200 para realizar traduções entre diferentes idiomas.

O processamento é integrado à aplicação web utilizando tecnologias compatíveis com execução no navegador, permitindo reduzir a dependência de serviços externos durante o processo de tradução.

## Processamento de áudio

A aplicação utiliza recursos da Web Audio API e AudioWorklet para captura e processamento de áudio diretamente no navegador.

Essa estrutura serve como base para o desenvolvimento do modo de tradução por voz e futuras funcionalidades de comunicação em tempo real.

## Estrutura do projeto

```text
Echo/
├── public/
├── src/
│   ├── app/
│   └── components/
├── package.json
├── package-lock.json
├── next.config.ts
├── tsconfig.json
└── README.md
