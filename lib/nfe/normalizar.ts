import type { ClienteFiscal, ItemFiscal, PayloadNFe } from "./types";

export function parseNumero(valor: unknown) {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;

  if (typeof valor === "string") {
    const normalizado = valor
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(,|$))/g, "")
      .replace(",", ".");

    return Number(normalizado) || 0;
  }

  return 0;
}

function somenteDigitos(valor: unknown) {
  return String(valor || "").replace(/\D/g, "");
}

function texto(valor: unknown) {
  return String(valor || "").trim();
}

function escolher(...valores: unknown[]) {
  return texto(valores.find((valor) => texto(valor)));
}

export function montarClienteFiscal(venda: any, cliente: any, override?: any): ClienteFiscal {
  const clienteOverride = override?.cliente || {};
  const enderecoOverride = clienteOverride.endereco || {};

  return {
    nomeRazaoSocial: escolher(
      clienteOverride.nomeRazaoSocial,
      clienteOverride.razaoSocial,
      cliente?.razaoSocial,
      cliente?.nome,
      venda.razaoSocial,
      venda.cliente
    ),
    cpfCnpj: somenteDigitos(
      escolher(
        clienteOverride.cpfCnpj,
        clienteOverride.documento,
        cliente?.cpfCnpj,
        cliente?.cnpj,
        cliente?.cpf,
        cliente?.documento,
        venda.cpfCnpj,
        venda.cnpj,
        venda.cpf
      )
    ),
    inscricaoEstadual: escolher(
      clienteOverride.inscricaoEstadual,
      cliente?.inscricaoEstadual,
      cliente?.ie,
      venda.inscricaoEstadual
    ),
    email: escolher(clienteOverride.email, cliente?.email, venda.email),
    telefone: escolher(clienteOverride.telefone, cliente?.telefone, venda.telefone),
    endereco: {
      logradouro: escolher(
        enderecoOverride.logradouro,
        enderecoOverride.endereco,
        cliente?.logradouro,
        cliente?.endereco,
        venda.logradouro,
        venda.endereco
      ),
      numero: escolher(enderecoOverride.numero, cliente?.numero, venda.numero),
      complemento: escolher(
        enderecoOverride.complemento,
        cliente?.complemento,
        venda.complemento
      ),
      bairro: escolher(enderecoOverride.bairro, cliente?.bairro, venda.bairro),
      cidade: escolher(enderecoOverride.cidade, cliente?.cidade, venda.cidade),
      uf: escolher(enderecoOverride.uf, cliente?.uf, cliente?.estado, venda.uf, venda.estado).toUpperCase(),
      cep: somenteDigitos(escolher(enderecoOverride.cep, cliente?.cep, venda.cep)),
    },
  };
}

export function montarItensFiscais(venda: any, override?: any): ItemFiscal[] {
  const itensOverride = Array.isArray(override?.itens) ? override.itens : [];
  const itensOrigem = itensOverride.length > 0
    ? itensOverride
    : Array.isArray(venda.itens)
      ? venda.itens
      : [];

  if (itensOrigem.length === 0) {
    const valorTotal = parseNumero(
      venda.financeiro?.valorVenda ?? venda.valorTotal ?? venda.valor
    );

    return [
      {
        descricao: escolher(venda.servico, venda.material, "Serviço não informado"),
        ncm: escolher(venda.ncm),
        cfop: escolher(venda.cfop),
        unidade: escolher(venda.unidade, "UN") || "UN",
        quantidade: 1,
        valorUnitario: valorTotal,
        valorTotal,
        impostos: venda.impostos || {},
      },
    ];
  }

  return itensOrigem.map((item: any, index: number) => {
    const quantidade = parseNumero(item.quantidade) || 1;
    const valorTotal = parseNumero(
      item.valorTotal ?? item.subtotal ?? item.total ?? item.valor
    );
    const valorUnitarioInformado = parseNumero(
      item.valorUnitario ?? item.precoUnitario ?? item.precoMetro ?? item.precoM2
    );
    const valorUnitario =
      valorUnitarioInformado || (quantidade > 0 ? valorTotal / quantidade : valorTotal);

    // Os dados fiscais como CFOP, NCM, CST/CSOSN, alíquotas e regime tributário devem ser validados pelo contador da empresa.
    return {
      id: texto(item.id) || `item-${index + 1}`,
      descricao: escolher(item.descricao, item.servico, item.material, item.nome),
      ncm: somenteDigitos(escolher(item.ncm, item.NCM)),
      cfop: somenteDigitos(escolher(item.cfop, item.CFOP)),
      unidade: escolher(item.unidade, item.un, "UN") || "UN",
      quantidade,
      valorUnitario,
      valorTotal: valorTotal || quantidade * valorUnitario,
      impostos: item.impostos || {},
    };
  });
}

export function montarPayloadFiscal(venda: any, cliente: any, override?: any): PayloadNFe {
  const itens = montarItensFiscais(venda, override);
  const valorTotalInformado = parseNumero(
    venda.financeiro?.valorVenda ?? venda.valorTotal ?? venda.valor
  );
  const valorTotalItens = itens.reduce((total, item) => total + item.valorTotal, 0);
  const orcamentoId = texto(venda.orcamentoId) || texto(venda.id);

  return {
    referencia: texto(venda.numeroOS) || orcamentoId,
    ambiente:
      process.env.NFE_AMBIENTE === "producao" ? "producao" : "homologacao",
    vendaId: texto(venda.id),
    orcamentoId,
    numeroOS: texto(venda.numeroOS) || orcamentoId,
    clienteId: texto(venda.clienteId),
    cliente: montarClienteFiscal(venda, cliente, override),
    itens,
    valorTotal: valorTotalInformado || valorTotalItens,
    observacoes: texto(venda.observacoes),
  };
}

export function validarPayloadFiscal(payload: PayloadNFe) {
  const erros: string[] = [];
  const cliente = payload.cliente;
  const endereco = cliente.endereco;

  if (!cliente.nomeRazaoSocial) erros.push("Nome/razão social do cliente é obrigatório.");
  if (!cliente.cpfCnpj) erros.push("CPF/CNPJ do cliente é obrigatório.");
  if (!endereco.logradouro) erros.push("Endereço completo é obrigatório.");
  if (!endereco.numero) erros.push("Número do endereço é obrigatório.");
  if (!endereco.bairro) erros.push("Bairro é obrigatório.");
  if (!endereco.cidade) erros.push("Cidade é obrigatória.");
  if (!endereco.uf || endereco.uf.length !== 2) erros.push("UF válida é obrigatória.");
  if (!endereco.cep) erros.push("CEP é obrigatório.");

  payload.itens.forEach((item, index) => {
    const prefixo = `Item ${index + 1}`;

    if (!item.descricao) erros.push(`${prefixo}: descrição é obrigatória.`);
    if (!item.ncm) erros.push(`${prefixo}: NCM é obrigatório.`);
    if (!item.cfop) erros.push(`${prefixo}: CFOP é obrigatório.`);
    if (!item.unidade) erros.push(`${prefixo}: unidade é obrigatória.`);
    if (item.quantidade <= 0) erros.push(`${prefixo}: quantidade deve ser maior que zero.`);
    if (item.valorUnitario <= 0) erros.push(`${prefixo}: valor unitário deve ser maior que zero.`);
    if (item.valorTotal <= 0) erros.push(`${prefixo}: valor total deve ser maior que zero.`);
  });

  return erros;
}
