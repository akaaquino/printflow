# Auditoria do banco / Firebase — PrintFlow

## Diagnóstico principal

O erro mostrado no navegador (`FirebaseError: Missing or insufficient permissions`) é compatível com a combinação de duas regras/implementações no projeto:

1. O `firestore.rules` exige que cada documento possua `tenantId` igual ao UID do usuário autenticado.
2. Várias páginas faziam `getDocs(collection(...))` sem filtrar por `tenantId`.

No Firestore, uma consulta ampla não pode ser autorizada por uma regra que só permite documentos do tenant atual. Portanto, mesmo com o usuário autenticado, essas leituras eram recusadas.

Além disso, vários fluxos de criação não gravavam `tenantId` nos novos documentos. Esses `addDoc()` também eram recusados pela regra `canWriteTenant()`.

## O que foi corrigido

- Criado `lib/firebase-tenant.ts` com `getTenantId()` e `tenantCollection()`.
- Leituras client-side principais foram alteradas para sempre incluir `where("tenantId", "==", UID)`.
- Consultas compostas de clientes, artes e produções passaram a carregar o filtro do tenant.
- Novos registros de materiais, movimentações de estoque, impressoras, clientes, CRM, orçamentos e artes passaram a receber `tenantId`.
- Coleções usadas pelo sistema financeiro (`caixas` e `movimentacoesCaixa`) e `impressoras` foram adicionadas às regras do Firestore.
- A busca limitada da produção deixou de depender de ordenação no servidor para evitar dependência de índices compostos nessa etapa.
- Adicionado `scripts/migrar-tenant.mjs` para corrigir documentos antigos que não possuem `tenantId`.
- Adicionado `npm run migrar-tenant`.
- `.env.example` foi ampliado com as variáveis públicas do Firebase e com `MIGRATION_TENANT_ID`.

## Dado importante sobre registros antigos

Os documentos antigos que não possuem `tenantId` continuarão bloqueados pelas regras novas. É necessária uma migração única.

Depois de configurar as credenciais Admin do Firebase, execute:

```bash
npm run migrar-tenant -- SEU_UID_FIREBASE
```

O script só adiciona `tenantId` onde ele está ausente. Ele não substitui `tenantId` que já exista.

## Sobre os outros erros do console

- `Failed to load resource: net::ERR_BLOCKED_BY_CLIENT`: normalmente aponta para bloqueio do navegador/extensão. Vale testar uma janela anônima sem extensões.
- `configuracoes?_rsc=... 404`: existe um link `/configuracoes` no Sidebar, mas não há `app/configuracoes/page.tsx` no projeto auditado. Isso é um problema separado do Firestore.

## Validação feita

Os arquivos TypeScript/TSX alterados foram analisados com o parser do TypeScript e não apresentaram erros de sintaxe.

A checagem completa de tipos não pôde ser concluída porque o `npm ci` do ambiente expirou e deixou as dependências incompletas. Portanto, a validação final deve ser feita localmente com:

```bash
npm ci
npm run typecheck
npm run lint
npm run build
```
