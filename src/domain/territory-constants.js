/**
 * Brazilian Federative Units (UF) IBGE numeric codes mapped to their 2-letter abbreviations.
 * @type {ReadonlyMap<string, string>}
 */
export const UF_CODE_TO_SIGLA = new Map([
  ["11", "RO"],
  ["12", "AC"],
  ["13", "AM"],
  ["14", "RR"],
  ["15", "PA"],
  ["16", "AP"],
  ["17", "TO"],
  ["21", "MA"],
  ["22", "PI"],
  ["23", "CE"],
  ["24", "RN"],
  ["25", "PB"],
  ["26", "PE"],
  ["27", "AL"],
  ["28", "SE"],
  ["29", "BA"],
  ["31", "MG"],
  ["32", "ES"],
  ["33", "RJ"],
  ["35", "SP"],
  ["41", "PR"],
  ["42", "SC"],
  ["43", "RS"],
  ["50", "MS"],
  ["51", "MT"],
  ["52", "GO"],
  ["53", "DF"],
]);

/**
 * 2-letter UF abbreviations mapped to their official state names.
 * @type {ReadonlyMap<string, string>}
 */
export const UF_SIGLA_TO_NAME = new Map([
  ["RO", "Rondônia"],
  ["AC", "Acre"],
  ["AM", "Amazonas"],
  ["RR", "Roraima"],
  ["PA", "Pará"],
  ["AP", "Amapá"],
  ["TO", "Tocantins"],
  ["MA", "Maranhão"],
  ["PI", "Piauí"],
  ["CE", "Ceará"],
  ["RN", "Rio Grande do Norte"],
  ["PB", "Paraíba"],
  ["PE", "Pernambuco"],
  ["AL", "Alagoas"],
  ["SE", "Sergipe"],
  ["BA", "Bahia"],
  ["MG", "Minas Gerais"],
  ["ES", "Espírito Santo"],
  ["RJ", "Rio de Janeiro"],
  ["SP", "São Paulo"],
  ["PR", "Paraná"],
  ["SC", "Santa Catarina"],
  ["RS", "Rio Grande do Sul"],
  ["MS", "Mato Grosso do Sul"],
  ["MT", "Mato Grosso"],
  ["GO", "Goiás"],
  ["DF", "Distrito Federal"],
]);
