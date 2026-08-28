# Auditoria gramatical — PrintFlow SaaS

Data: 28/08/2026

## Escopo

Foi realizada uma revisão textual dos arquivos-fonte e de documentação do projeto, com foco em:

- ortografia e acentuação em português do Brasil;
- caracteres corrompidos por codificação;
- consistência de textos exibidos na interface;
- mensagens de erro, confirmação e sucesso;
- preservação de nomes técnicos, coleções, campos e enums internos do sistema.

## Correções aplicadas

As correções principais ficaram concentradas em `app/orcamentos/page.tsx` e `app/page.tsx`.

Exemplos corrigidos:

- `Or?amento` → `Orçamento`
- `aprova??o` → `aprovação`
- `Pre?o por m?` → `Preço por m²`
- `?rea` / `m?` → `Área` / `m²`
- `Observa??es` → `Observações`
- `Servico` / `Servicos` → `Serviço` / `Serviços`
- `Instalacao` → `Instalação`
- `Acoes` → `Ações`
- `Cliente nao informado` → `Cliente não informado`
- `Nao informado` → `Não informado`
- `Nao foi possivel salvar o orcamento.` → `Não foi possível salvar o orçamento.`
- `Em orcamento` → `Em orçamento`
- `Em aprova??o` → `Em aprovação`
- `Instalacao criada automaticamente pelo orcamento...` → `Instalação criada automaticamente pelo orçamento...`
- `Acompanhe os trabalhos por periodo: orcamento, aprovacao, producao, instalacao e finalizacao.` → versão totalmente acentuada em português.

## Compatibilidade preservada

Não foram alterados nomes técnicos que fazem parte do contrato interno da aplicação, como:

- coleções do Firestore (`orcamentos`, `producoes`, `instalacoes`);
- nomes de propriedades/campos (`numeroOS`, `observacoes`, `precoMetro` etc.);
- valores internos sem acento usados como chaves de integração/compatibilidade;
- URLs, nomes de arquivos, variáveis de ambiente e identificadores de código.

Em especial, ocorrências legadas como `"Enviado para producao"` foram mantidas quando utilizadas como compatibilidade com dados antigos, enquanto a forma correta `"Enviado para produção"` já é utilizada no fluxo atual.

## Validação

Foram verificadas as ocorrências de caracteres corrompidos encontrados no pacote, incluindo `Or?amento`, `aprova??o`, `Pre?o`, `?rea`, `m?` e `Observa??es`, e elas não permanecem nos arquivos corrigidos.

Também foi tentada a validação por TypeScript. O pacote enviado contém uma instalação incompleta de dependências em `node_modules`, o que impede uma validação técnica completa neste ambiente: módulos como `next/server`, `next`, `react/jsx-runtime` e `@types/node` não puderam ser resolvidos. Esses erros já são consequência do ambiente/pacote de dependências e não das correções gramaticais realizadas.

## Observação sobre o pacote entregue

A versão corrigida foi empacotada com os arquivos editáveis do projeto e seus arquivos de configuração/documentação. Diretórios gerados/cache e dependências vendorizadas (`.next` e `node_modules`) não fazem parte da revisão gramatical e não foram necessários para as correções.
