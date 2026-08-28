# CLAUDE.md - Diretrizes de Desenvolvimento e Engenharia

Este documento serve como guia de contexto, arquitetura e comportamento para agentes de IA e pessoas desenvolvedoras no PrintFlow.

## 1. Filosofia de Trabalho

Trabalhamos em modo de pair programming.

- O humano define direção, escopo, regra de negócio e limites arquiteturais.
- O agente propõe soluções, escreve código limpo, valida o resultado e evita regressões.
- Não invente complexidade. Prefira a solução simples, incremental e compatível com o código existente.

## 2. Small Releases

Cada iteração deve ser funcional, segura e validada. Antes de encerrar uma tarefa, execute:

```bash
npm run typecheck
npm run lint
npm run security
npm run build
```

Se algum comando falhar por problema introduzido na mudança, corrija no mesmo ciclo.

## 3. Qualidade e Testes

- Crie ou atualize testes quando houver suíte disponível para a área alterada.
- Cubra caminhos de sucesso e falha quando a mudança envolver API, validação, upload, autenticação, Firestore ou cálculo financeiro.
- Não use `location.reload()` para esconder inconsistências de estado.

## 4. Refatoração Contínua

- Extraia helpers quando houver duplicação real ou função com responsabilidades demais.
- Não faça refatorações grandes junto de correções pequenas, a menos que sejam necessárias para concluir com segurança.
- Preserve compatibilidade com dados antigos no Firestore.

## 5. Segurança Proativa

- Valide entradas de usuário e dados vindos de APIs externas.
- Nunca exponha tokens, chaves privadas, senhas ou credenciais sensíveis no frontend, logs ou repositório.
- Requisições externas feitas no backend devem ter timeout e validação de destino quando aceitarem URL variável.
- Endpoints de mutação devem validar autenticação e autorização.
- Uploads devem usar allowlist de extensão/tipo, limite de tamanho e nomes sanitizados.

## 6. Papéis administrativos (admin/financeiro)

O PrintFlow hoje é 1 login Firebase = 1 tenant (não existe conceito de
"equipe"/múltiplos usuários por conta). Ainda assim, ações sensíveis como
emissão de NF-e exigem por padrão o custom claim `admin: true` ou
`financeiro: true` no usuário (fail-closed — ver item 2 abaixo).

Para atribuir esse papel a uma conta, use o script administrativo (roda
localmente, nunca em produção/servidor da aplicação):

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/caminho/para/service-account.json
npm run definir-papel -- --email dono@suagrafica.com --admin
```

Esse script exige uma credencial de service account do Firebase (gerada em
Console > Configurações do projeto > Contas de serviço). Essa credencial tem
privilégio total sobre o projeto — nunca a coloque em variável de ambiente do
servidor de produção, em código versionado, ou em qualquer lugar acessível
pelo frontend. Guarde-a apenas na máquina de quem administra a
infraestrutura.

Quando o produto evoluir para suportar múltiplos usuários por conta (equipe),
este fluxo deve ser substituído por uma tela de administração dentro do
produto, backada por uma rota de API que use o Admin SDK no servidor — nunca
pelo cliente diretamente.

## 7. Auditoria de dependências

`npm run security:audit` roda `npm audit --omit=dev`, ou seja, cobre apenas
as dependências que efetivamente entram no build/runtime da aplicação.
Dependências de desenvolvimento (ex.: `firebase-admin`, usado só pelo script
acima) podem acumular avisos que não afetam o app em produção; rode
`npm run security:audit:dev` periodicamente para revisá-los mesmo assim.


## 8. Aprendizados do Projeto

- O projeto usa Firebase/Firestore e várias coleções antigas; sempre manter fallbacks para campos legados.
- A geração de produção depende do fluxo Orçamentos -> Aprovação de Arte (interna) -> Produção. Não quebrar esse encadeamento. A aprovação de arte pelo cliente final via link público foi removida (ver achado 3.2 da auditoria); a aprovação hoje é sempre feita pela equipe internamente na tela /aprovacao (com registro manual de confirmação via WhatsApp quando aplicável).
- Integrações fiscais e APIs com token devem passar por rotas backend, nunca pelo frontend.

## 9. Checklist Pós-Implementação

- [ ] O código resolve o problema real sem engenharia excessiva?
- [ ] Estados de erro e dados antigos foram considerados?
- [ ] TypeScript, lint, segurança e build foram executados?
- [ ] Nenhum segredo sensível foi introduzido?
- [ ] A documentação precisa registrar algum novo aprendizado?
