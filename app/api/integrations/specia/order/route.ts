import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/api/firebase-admin";

export const runtime = "nodejs";

interface CustomerPayload {
  name?: string;
  company?: string;
  phone?: string;
  email?: string;
  document?: string;
  address?: string;
  city?: string;
  uf?: string;
}

interface SpeciaOrder {
  id?: string;
  number?: string;
  status?: string;
  specificationId?: string;
  createdAt?: string;
  approvedArtwork?: {
    id?: string;
    version?: number;
    approvedAt?: string;
  };
  snapshot?: {
    product?: string | null;
    quantity?: number | null;
    size?: string | null;
    format?: string | null;
    finalPrice?: number | null;
    currency?: string | null;
    briefing?: {
      theme?: string | null;
      text?: string | null;
      context?: string | null;
    };
    specification?: {
      product?: string | null;
      context?: string | null;
      attributes?: Array<{ key?: string; value?: string | number | boolean | null }>;
    };
  };
}

function stringsEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function attribute(order: SpeciaOrder, keys: string[]): unknown {
  const attrs = order.snapshot?.specification?.attributes || [];
  const normalized = new Set(keys.map((key) => key.toLowerCase()));
  const found = attrs.find((item) => normalized.has(String(item.key || "").toLowerCase()));
  return found?.value ?? null;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildItems(order: SpeciaOrder) {
  const snapshot = order.snapshot;
  const size = text(snapshot?.size || attribute(order, ["size", "tamanho"]));
  const quantity = Math.max(numberValue(snapshot?.quantity || attribute(order, ["quantity", "quantidade", "qtd"])) || 1, 1);
  const format = text(snapshot?.format || attribute(order, ["format", "formato"]));
  const service = text(snapshot?.product || attribute(order, ["product", "produto"])) || "Pedido SPECIA";
  const price = numberValue(snapshot?.finalPrice);

  return [{
    id: `${order.id || order.number || "specia"}-1`,
    materialId: "",
    material: service,
    servico: service,
    largura: 0,
    altura: 0,
    medida: size || format || "A definir",
    area: 0,
    areaM2: 0,
    quantidade,
    valorM2: price,
    custoM2: 0,
    valorTotal: price,
    custoTotal: 0,
    lucro: price,
    margemReal: price > 0 ? 100 : 0,
    margemDesejada: 20,
    subtotal: price,
    acabamento: "",
    cor: "",
    observacoes: [
      snapshot?.briefing?.theme ? `Tema: ${snapshot.briefing.theme}` : "",
      snapshot?.briefing?.text ? `Texto: ${snapshot.briefing.text}` : "",
      snapshot?.briefing?.context ? `Contexto: ${snapshot.briefing.context}` : "",
    ].filter(Boolean).join("\n"),
  }];
}

function buildResumo(order: SpeciaOrder) {
  const total = numberValue(order.snapshot?.finalPrice);
  return {
    vendaTotal: total,
    custoTotal: 0,
    lucroTotal: total,
    margemMedia: total > 0 ? 100 : 0,
    origem: "SPECIA",
  };
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.SPECIA_INTEGRATION_SECRET;
  const receivedSecret = request.headers.get("x-specia-integration-secret") || "";

  if (!expectedSecret) {
    return NextResponse.json({ success: false, error: "Integração SPECIA não configurada no PrintFlow." }, { status: 503 });
  }

  if (!receivedSecret || !stringsEqual(receivedSecret, expectedSecret)) {
    return NextResponse.json({ success: false, error: "Não autorizado." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const tenantId = text(body?.tenantId);
    const allowedTenantId = text(process.env.SPECIA_ALLOWED_TENANT_ID);
    const order = body?.order as SpeciaOrder | undefined;
    const customer = (body?.customer || {}) as CustomerPayload;

    if (!tenantId || !order?.id || !order.number) {
      return NextResponse.json({ success: false, error: "tenantId, order.id e order.number são obrigatórios." }, { status: 400 });
    }

    if (allowedTenantId && tenantId !== allowedTenantId) {
      return NextResponse.json({ success: false, error: "Tenant não autorizado para a integração SPECIA." }, { status: 403 });
    }

    const db = getAdminFirestore();
    const existing = await db.collection("crm")
      .where("speciaOrderId", "==", order.id)
      .limit(1)
      .get();

    if (!existing.empty) {
      return NextResponse.json({
        success: true,
        duplicated: true,
        pedidoId: existing.docs[0].id,
        numeroOS: existing.docs[0].get("numeroOS") || order.number,
      });
    }

    const customerName = text(customer.name) || text(attribute(order, ["customer_name", "customerName", "nome_cliente"])) || "Cliente SPECIA";
    const phone = text(customer.phone) || text(attribute(order, ["phone", "telefone", "whatsapp"]));
    const email = text(customer.email) || text(attribute(order, ["email"]));
    const company = text(customer.company) || text(attribute(order, ["company", "businessName", "empresa"]));
    const document = text(customer.document) || text(attribute(order, ["cnpj", "cpf", "cpfCnpj", "document"]));

    let clienteId = "";

    if (document) {
      const byDocument = await db.collection("clientes")
        .where("cpfCnpj", "==", document)
        .limit(10)
        .get();
      const matchingDocument = byDocument.docs.find((doc) => doc.get("tenantId") === tenantId);
      if (matchingDocument) clienteId = matchingDocument.id;
    }

    if (!clienteId && phone) {
      const byPhone = await db.collection("clientes")
        .where("telefone", "==", phone)
        .limit(10)
        .get();
      const matchingPhone = byPhone.docs.find((doc) => doc.get("tenantId") === tenantId);
      if (matchingPhone) clienteId = matchingPhone.id;
    }

    if (!clienteId) {
      const clienteRef = db.collection("clientes").doc();
      await clienteRef.set({
        tenantId,
        nome: customerName,
        razaoSocial: customerName,
        nomeFantasia: company,
        empresa: company,
        tipoDocumento: document ? "Documento" : "",
        cpfCnpj: document,
        cnpj: document,
        telefone: phone,
        whatsapp: phone,
        email,
        endereco: text(customer.address),
        cidade: text(customer.city),
        uf: text(customer.uf),
        origem: "SPECIA",
        criadoEm: FieldValue.serverTimestamp(),
        atualizadoEm: FieldValue.serverTimestamp(),
      });
      clienteId = clienteRef.id;
    }

    const items = buildItems(order);
    const resumoPreVenda = buildResumo(order);
    const valor = numberValue(order.snapshot?.finalPrice);
    const briefing = order.snapshot?.briefing;
    const pedidoRef = db.collection("crm").doc();

    await pedidoRef.set({
      tenantId,
      clienteId,
      cliente: customerName,
      empresa: company,
      telefone: phone,
      email,
      cnpj: document,
      servicoInteresse: text(order.snapshot?.product) || "Pedido SPECIA",
      valorEstimado: valor,
      itensPreVenda: items,
      resumoPreVenda,
      vendedor: "SPECIA",
      proximoContato: "",
      status: "Fechado",
      origem: "SPECIA",
      motivoPerda: "",
      observacoes: [
        `OS gerada pela SPECIA: ${order.number}.`,
        `ID da OS: ${order.id}.`,
        briefing?.theme ? `Tema: ${briefing.theme}` : "",
        briefing?.text ? `Texto: ${briefing.text}` : "",
        briefing?.context ? `Contexto: ${briefing.context}` : "",
        order.approvedArtwork?.id ? `Arte aprovada: ${order.approvedArtwork.id} (v${order.approvedArtwork.version || 1}).` : "",
      ].filter(Boolean).join("\n"),
      numeroOS: order.number,
      speciaOrderId: order.id,
      speciaOrderNumber: order.number,
      speciaSpecificationId: order.specificationId || "",
      speciaConversationId: text(body?.conversationId),
      speciaOrder: order,
      historico: [{
        status: "Fechado",
        acao: `Pedido recebido automaticamente da SPECIA (${order.number}).`,
        data: FieldValue.serverTimestamp(),
      }],
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
      origemIntegracao: "specia",
    });

    return NextResponse.json({
      success: true,
      duplicated: false,
      pedidoId: pedidoRef.id,
      clienteId,
      numeroOS: order.number,
    });
  } catch (error) {
    console.error("PRINTFLOW SPECIA INTEGRATION ERROR:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Erro interno ao importar a OS da SPECIA.",
    }, { status: 500 });
  }
}
