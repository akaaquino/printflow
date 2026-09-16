import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const tenantId = process.argv[2] || process.env.MIGRATION_TENANT_ID;

if (!tenantId) {
  console.error("Uso: node scripts/migrar-tenant.mjs SEU_UID_FIREBASE");
  console.error("Ou defina MIGRATION_TENANT_ID no ambiente.");
  process.exit(1);
}

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }

  return initializeApp();
}

const db = getFirestore(getAdminApp());
const collections = [
  "clientes",
  "orcamentos",
  "crm",
  "artes",
  "materiais",
  "movimentacoesEstoque",
  "impressoras",
  "caixas",
  "movimentacoesCaixa",
  "notasFiscais",
  "producoes",
  "instalacoes",
];

let totalAtualizados = 0;
let totalJaConfigurados = 0;

for (const collectionName of collections) {
  const snapshot = await db.collection(collectionName).get();
  const faltantes = snapshot.docs.filter((documento) => !documento.get("tenantId"));

  if (faltantes.length === 0) {
    console.log(`✓ ${collectionName}: nenhum documento sem tenantId.`);
    totalJaConfigurados += snapshot.size;
    continue;
  }

  const chunks = [];
  for (let i = 0; i < faltantes.length; i += 400) {
    chunks.push(faltantes.slice(i, i + 400));
  }

  for (const chunk of chunks) {
    const batch = db.batch();
    for (const documento of chunk) {
      batch.update(documento.ref, { tenantId });
    }
    await batch.commit();
  }

  totalAtualizados += faltantes.length;
  totalJaConfigurados += snapshot.size - faltantes.length;
  console.log(`✓ ${collectionName}: ${faltantes.length} documento(s) receberam tenantId=${tenantId}.`);
}

console.log("\nMigração concluída.");
console.log(`Documentos atualizados: ${totalAtualizados}`);
console.log(`Documentos que já tinham tenantId: ${totalJaConfigurados}`);
