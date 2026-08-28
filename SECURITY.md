# SECURITY.md - Diretrizes e Pipeline de Segurança

Este documento define a política de segurança do PrintFlow e o pipeline local recomendado para cada ciclo de desenvolvimento.

## 1. Pipeline Shift-Left

Antes de entregar alterações, execute:

```bash
npm run typecheck
npm run lint
npm run security
npm run build
```

O script `npm run security` executa:

- `npm audit --audit-level=moderate` para dependências.
- `node scripts/security-check.mjs` para checagem local de segredos e padrões perigosos.

## 2. Padrões de Código Seguro

### Injeção

Não concatene dados de usuário em queries ou comandos. Use APIs estruturadas, validação explícita e prepared statements quando houver banco SQL.

### Path Traversal

Não confie em nomes de arquivo fornecidos por usuários para ler ou gravar no disco. Use allowlist de extensões, normalize nomes e mantenha arquivos dentro do diretório pretendido.

### SSRF

Requisições HTTP para URLs variáveis devem bloquear destinos internos como `localhost`, `127.0.0.1`, `::1`, `169.254.169.254` e redes privadas. Sempre use timeout.

### Autenticação e Autorização

Todo endpoint de mutação deve validar usuário autenticado e escopo do recurso. Não confie apenas em IDs recebidos da rota ou payload.

## 3. Segredos

- Nunca commitar `.env`, tokens, certificados ou chaves privadas.
- Variáveis de produção devem vir do provedor de infraestrutura.
- Se houver suspeita de vazamento, rotacione a credencial e limpe o histórico.

## 4. Headers de Proteção

A aplicação deve enviar headers básicos:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` com origens explícitas.

Esses headers são configurados em `next.config.ts`.

## 5. Checklist de Segurança

- [ ] A mudança adiciona requisição externa? Existe timeout e validação?
- [ ] A mudança adiciona upload? Existe allowlist e limite de tamanho?
- [ ] A mudança adiciona endpoint? Existe autenticação e autorização?
- [ ] Algum segredo apareceu no diff?
- [ ] Dependências novas foram auditadas?
