import { collection, query, where, type QueryConstraint } from "firebase/firestore";
import { auth, db } from "@/app/lib/firebase";

/**
 * Retorna o UID autenticado atual ou falha explicitamente.
 * Isso evita criar/consultar documentos com tenantId vazio.
 */
export function getTenantId(): string {
  const uid = auth.currentUser?.uid;

  if (!uid) {
    throw new Error("Usuário não autenticado: tenantId não pôde ser determinado.");
  }

  return uid;
}

/**
 * Cria uma consulta Firestore sempre limitada ao tenant do usuário atual.
 * Todas as leituras client-side devem passar por esta função.
 */
export function tenantCollection(
  collectionName: string,
  constraints: QueryConstraint[] = []
) {
  return query(
    collection(db, collectionName),
    where("tenantId", "==", getTenantId()),
    ...constraints
  );
}
