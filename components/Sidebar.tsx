"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "@/app/lib/firebase";
import { useRouter, usePathname } from "next/navigation";

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();

  // =========================
  // FLUXO OPERACIONAL
  // =========================

  const menuOperacao = [
    { label: "Dashboard", href: "/", icon: "📊" },

    {
      label: "Central Comercial",
      href: "/crm",
      icon: "📞",
    },

    {
      label: "Clientes",
      href: "/clientes",
      icon: "👥",
    },

    {
      label: "Orçamentos",
      href: "/orcamentos",
      icon: "🧾",
    },

    {
      label: "Aprovação de Arte",
      href: "/aprovacao",
      icon: "🎨",
    },

    {
      label: "Produção",
      href: "/producoes",
      icon: "🏭",
    },

    {
      label: "Instalações",
      href: "/instalacoes",
      icon: "🛠️",
    },
  ];

  // =========================
  // GESTÃO
  // =========================

  const menuGestao = [
    {
      label: "Financeiro",
      href: "/financeiro",
      icon: "💰",
    },

    {
      label: "Materiais / Estoque",
      href: "/materiais",
      icon: "📦",
    },

    {
      label: "Relatórios",
      href: "/relatorios",
      icon: "📄",
    },

    {
      label: "Inteligência",
      href: "/inteligencia",
      icon: "🧠",
    },
  ];

  // =========================
  // CONFIGURAÇÕES
  // =========================

  const menuConfiguracoes = [
    {
      label: "Configurações",
      href: "/configuracoes",
      icon: "⚙️",
    },
  ];

  async function sair() {
    await signOut(auth);

    router.push("/login");
  }

  function ItemMenu({
    label,
    href,
    icon,
  }: {
    label: string;
    href: string;
    icon: string;
  }) {
    const ativo = pathname === href;

    return (
      <Link
        href={href}
        className={`group flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 ${
          ativo
            ? "bg-green-500 text-black"
            : "text-zinc-400 hover:text-white hover:bg-zinc-900"
        }`}
      >
        <span
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
            ativo
              ? "bg-black/10"
              : "bg-zinc-900 group-hover:bg-green-500 group-hover:text-black"
          }`}
        >
          {icon}
        </span>

        <span className="font-medium">
          {label}
        </span>
      </Link>
    );
  }

  return (
    <aside className="w-72 min-h-screen bg-zinc-950 border-r border-zinc-800 p-5 flex flex-col">
      {/* ========================= */}
      {/* LOGO */}
      {/* ========================= */}

      <div className="mb-10">
        <div className="w-12 h-12 rounded-2xl bg-green-500 flex items-center justify-center text-black font-black text-xl mb-4">
          P
        </div>

        <h1 className="text-2xl font-black text-white">
          PrintFlow
        </h1>

        <p className="text-zinc-500 text-sm mt-1">
          ERP para comunicação visual
        </p>
      </div>

      {/* ========================= */}
      {/* MENUS */}
      {/* ========================= */}

      <div className="flex flex-col gap-8">
        {/* ========================= */}
        {/* OPERAÇÃO */}
        {/* ========================= */}

        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3 px-2">
            Operação
          </p>

          <nav className="flex flex-col gap-2">
            {menuOperacao.map((item) => (
              <ItemMenu
                key={item.href}
                label={item.label}
                href={item.href}
                icon={item.icon}
              />
            ))}
          </nav>
        </div>

        {/* ========================= */}
        {/* GESTÃO */}
        {/* ========================= */}

        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3 px-2">
            Gestão
          </p>

          <nav className="flex flex-col gap-2">
            {menuGestao.map((item) => (
              <ItemMenu
                key={item.href}
                label={item.label}
                href={item.href}
                icon={item.icon}
              />
            ))}
          </nav>
        </div>

        {/* ========================= */}
        {/* CONFIGURAÇÕES */}
        {/* ========================= */}

        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3 px-2">
            Configurações
          </p>

          <nav className="flex flex-col gap-2">
            {menuConfiguracoes.map((item) => (
              <ItemMenu
                key={item.href}
                label={item.label}
                href={item.href}
                icon={item.icon}
              />
            ))}
          </nav>
        </div>
      </div>

      {/* ========================= */}
      {/* FOOTER */}
      {/* ========================= */}

      <div className="mt-auto flex flex-col gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-400 text-sm">
            ERP Industrial
          </p>

          <p className="text-white font-bold mt-1">
            PrintFlow SaaS
          </p>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
              <span>
                Evolução do sistema
              </span>

              <span>
                MVP
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div className="w-[45%] h-full bg-green-500 rounded-full"></div>
            </div>
          </div>
        </div>

        <button
          onClick={sair}
          className="cursor-pointer w-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-2xl py-3 font-bold transition-all duration-200 hover:scale-[1.02]"
        >
          Sair do sistema
        </button>
      </div>
    </aside>
  );
}
