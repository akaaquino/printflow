"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/app/lib/firebase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function fazerLogin(e: React.FormEvent) {
    e.preventDefault();

    try {
      setLoading(true);
      setErro("");

      await signInWithEmailAndPassword(
        auth,
        email,
        senha
      );

      router.push("/");
    } catch (error: any) {
      console.error(error);

      setErro("Email ou senha inválidos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl">
        <div className="mb-8">
          <div className="w-14 h-14 rounded-2xl bg-green-500 flex items-center justify-center text-black font-black text-2xl mb-4">
            P
          </div>

          <h1 className="text-4xl font-black text-white">
            PrintFlow
          </h1>

          <p className="text-zinc-400 mt-2">
            Faça login para acessar o sistema.
          </p>
        </div>

        <form
          onSubmit={fazerLogin}
          className="flex flex-col gap-4"
        >
          <input
            type="email"
            placeholder="Seu email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            className="bg-zinc-950 border border-zinc-700 rounded-2xl p-4 text-white outline-none focus:border-green-500 transition-all"
            required
          />

          <input
            type="password"
            placeholder="Sua senha"
            value={senha}
            onChange={(e) =>
              setSenha(e.target.value)
            }
            className="bg-zinc-950 border border-zinc-700 rounded-2xl p-4 text-white outline-none focus:border-green-500 transition-all"
            required
          />

          {erro && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl p-3">
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-green-500 hover:bg-green-400 text-black font-bold py-4 rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            {loading
              ? "Entrando..."
              : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}