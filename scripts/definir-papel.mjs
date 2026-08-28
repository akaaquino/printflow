#!/usr/bin/env node
/**
 * Script administrativo: atribui/remove os custom claims "admin" e/ou
 * "financeiro" de um usuário do Firebase Auth.
 *
 * Por que isso existe fora do app:
 * Definir custom claims exige o Firebase Admin SDK com uma credencial de
 * service account — um segredo com privilégios totais sobre o projeto.
 * Esse tipo de credencial NUNCA deve rodar no navegador nem em uma rota de
 * API pública; por isso este é um script de linha de comando, executado
 * manualmente por quem administra a infraestrutura, e não uma tela do produto.
 *
 * Pré-requisitos:
 * 1. Gere uma chave de service account em:
 *    Firebase Console > Configurações do projeto > Contas de serviço > Gerar nova chave privada
 * 2. Salve o JSON baixado FORA do repositório (ex.: ~/.secrets/printflow-service-account.json)
 *    — nunca commite esse arquivo.
 * 3. Exporte a variável de ambiente apontando para o arquivo:
 *    export GOOGLE_APPLICATION_CREDENTIALS=~/.secrets/printflow-service-account.json
 *
 * Uso:
 *   node scripts/definir-papel.mjs --email dono@suagrafica.com --admin
 *   node scripts/definir-papel.mjs --email financeiro@suagrafica.com --financeiro
 *   node scripts/definir-papel.mjs --email ex-funcionario@suagrafica.com --remover
 *   node scripts/definir-papel.mjs --uid abcxyz123 --admin --financeiro
 */

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function lerArgumentos(argv) {
  const args = { admin: false, financeiro: false, remover: false };

  for (let i = 0; i < argv.length; i += 1) {
    const atual = argv[i];

    if (atual === "--email") args.email = argv[++i];
    else if (atual === "--uid") args.uid = argv[++i];
    else if (atual === "--admin") args.admin = true;
    else if (atual === "--financeiro") args.financeiro = true;
    else if (atual === "--remover") args.remover = true;
  }

  return args;
}

async function main() {
  const args = lerArgumentos(process.argv.slice(2));

  if (!args.email && !args.uid) {
    console.error("Uso: node scripts/definir-papel.mjs --email <email> [--admin] [--financeiro] [--remover]");
    process.exit(1);
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      "Defina GOOGLE_APPLICATION_CREDENTIALS apontando para o JSON da service account " +
        "antes de executar este script. Veja o cabeçalho deste arquivo para instruções."
    );
    process.exit(1);
  }

  initializeApp();
  const auth = getAuth();

  const usuario = args.uid
    ? await auth.getUser(args.uid)
    : await auth.getUserByEmail(args.email);

  const claimsAtuais = usuario.customClaims || {};

  const novosClaims = args.remover
    ? { ...claimsAtuais, admin: false, financeiro: false }
    : {
        ...claimsAtuais,
        ...(args.admin ? { admin: true } : {}),
        ...(args.financeiro ? { financeiro: true } : {}),
      };

  await auth.setCustomUserClaims(usuario.uid, novosClaims);

  console.log(`Papéis atualizados para ${usuario.email} (uid: ${usuario.uid}).`);
  console.log("Claims resultantes:", novosClaims);
  console.log(
    "Importante: o usuário precisa fazer logout/login (ou aguardar até ~1h) " +
      "para que o novo token reflita os claims atualizados."
  );
}

main().catch((erro) => {
  console.error("Erro ao definir papel:", erro.message || erro);
  process.exit(1);
});
