export type TipoDocumento = "CPF" | "CNPJ";

export function limparDocumento(valor: unknown) {
  return String(valor || "").replace(/\D/g, "").slice(0, 14);
}

export function limparCEP(valor: unknown) {
  return String(valor || "").replace(/\D/g, "").slice(0, 8);
}

export function identificarTipoDocumento(valor: unknown): TipoDocumento | null {
  const documento = limparDocumento(valor);

  if (documento.length === 11) return "CPF";
  if (documento.length === 14) return "CNPJ";

  return null;
}

export function validarCPF(valor: unknown) {
  const cpf = limparDocumento(valor);

  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;

  for (let i = 0; i < 9; i += 1) {
    soma += Number(cpf[i]) * (10 - i);
  }

  let digito = 11 - (soma % 11);
  if (digito >= 10) digito = 0;
  if (digito !== Number(cpf[9])) return false;

  soma = 0;

  for (let i = 0; i < 10; i += 1) {
    soma += Number(cpf[i]) * (11 - i);
  }

  digito = 11 - (soma % 11);
  if (digito >= 10) digito = 0;

  return digito === Number(cpf[10]);
}

export function validarCNPJ(valor: unknown) {
  const cnpj = limparDocumento(valor);

  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const calcularDigito = (base: string, pesos: number[]) => {
    const soma = base
      .split("")
      .reduce((total, numero, index) => total + Number(numero) * pesos[index], 0);
    const resto = soma % 11;

    return resto < 2 ? 0 : 11 - resto;
  };

  const primeiroDigito = calcularDigito(
    cnpj.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  );
  const segundoDigito = calcularDigito(
    cnpj.slice(0, 13),
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  );

  return (
    primeiroDigito === Number(cnpj[12]) && segundoDigito === Number(cnpj[13])
  );
}

export function formatarCPF(valor: unknown) {
  const cpf = limparDocumento(valor).slice(0, 11);

  return cpf
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

export function formatarCNPJ(valor: unknown) {
  const cnpj = limparDocumento(valor).slice(0, 14);

  return cnpj
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

export function formatarDocumento(valor: unknown) {
  const documento = limparDocumento(valor);

  if (documento.length <= 11) return formatarCPF(documento);

  return formatarCNPJ(documento);
}

export function formatarCEP(valor: unknown) {
  const cep = limparCEP(valor);

  return cep.replace(/^(\d{5})(\d)/, "$1-$2");
}
