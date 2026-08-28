import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

function obterVariavelObrigatoria(nome: string, valor: string | undefined) {
  if (!valor) {
    throw new Error(
      `Configuração do Firebase incompleta: defina a variável de ambiente ${nome}. ` +
        "Veja .env.example para a lista completa de variáveis necessárias."
    );
  }

  return valor;
}

const firebaseConfig = {
  apiKey: obterVariavelObrigatoria(
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  ),
  authDomain: obterVariavelObrigatoria(
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  ),
  projectId: obterVariavelObrigatoria(
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  ),
  storageBucket: obterVariavelObrigatoria(
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  ),
  messagingSenderId: obterVariavelObrigatoria(
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  ),
  appId: obterVariavelObrigatoria(
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  ),
  // Opcional: Analytics não é essencial para a aplicação funcionar.
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
