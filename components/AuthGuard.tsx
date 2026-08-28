"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/app/lib/firebase";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usuario) => {
      if (!usuario) {
        router.push("/login");
      } else {
        setCarregando(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  if (carregando) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        Carregando sistema...
      </main>
    );
  }

  return <>{children}</>;
}