import {
  collection,
  query,
  where,
  type CollectionReference,
  type DocumentData,
  type Query,
  type QueryConstraint,
} from "firebase/firestore";
import { auth } from "@/app/lib/firebase";

export function obterTenantId(): string {
  const tenantId = auth.currentUser?.uid;

  if (!tenantId) {
    throw new Error("Usuário não autenticado. Faça login novamente.");
  }

  return tenantId;
}

export function queryDoTenant<T extends DocumentData = DocumentData>(
  referencia: CollectionReference<T>,
  ...constraints: QueryConstraint[]
): Query<T> {
  return query(referencia, where("tenantId", "==", obterTenantId()), ...constraints);
}
