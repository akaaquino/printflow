import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const tenantId = process.env.TENANT_ID?.trim();
if (!tenantId) {
  console.error("Defina TENANT_ID com o UID do usuário/tenant que deve receber os dados legados.");
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

if (!getApps().length) {
  if (projectId && clientEmail && privateKey) {
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  } else {
    initializeApp({ credential: applicationDefault() });
  }
}

const db = getFirestore();
const collections = (process.env.COLECOES ||
  "clientes,orcamentos,crm,artes,materiais,movimentacoesEstoque,impressoras,caixas,movimentacoesCaixa,producoes,instalacoes,notasFiscais")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

let totalAtualizados = 0;
let totalJaSeguros = 0;
let totalIgnorados = 0;

for (const collectionName of collections) {
  const snapshot = await db.collection(collectionName).get();
  let atualizados = 0;
  let seguros = 0;

  let batch = db.batch();
  let batchCount = 0;

  for (const documento of snapshot.docs) {
    const dados = documento.data();
    const atual = typeof dados.tenantId === "string" ? dados.tenantId.trim() : "";

    if (atual) {
      seguros += 1;
      if (atual !== tenantId) {
        console.warn(
          `[IGNORADO] ${collectionName}/${documento.id} já possui tenantId diferente (${atual}).`
        );
      }
      continue;
    }

    batch.update(documento.ref, { tenantId });
    batchCount += 1;
    atualizados += 1;

    if (batchCount === 450) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) await batch.commit();

  if (atualizados || seguros) {
    console.log(
      `[${collectionName}] atualizados=${atualizados} já_com_tenant=${seguros}`
    );
  }

  totalAtualizados += atualizados;
  totalJaSeguros += seguros;
}

console.log("\nMigração concluída.");
console.log(`Documentos atualizados: ${totalAtualizados}`);
console.log(`Documentos já com tenantId: ${totalJaSeguros}`);
console.log(`Tenant utilizado: ${tenantId}`);
console.log(`Documentos ignorados por tenant diferente: ${totalIgnorados}`);
