// Country name normalization and detection utilities.
// Shared between services to avoid duplicated mappings.

const COUNTRY_NAME_MAP: Record<string, string> = {
  // German
  'Deutschland': 'Germany',
  'Schweiz': 'Switzerland',
  'Österreich': 'Austria',
  'Niederlande': 'Netherlands',
  'Belgien': 'Belgium',
  'Dänemark': 'Denmark',
  'Schweden': 'Sweden',
  'Norwegen': 'Norway',
  'Finnland': 'Finland',
  'Polen': 'Poland',
  'Tschechien': 'Czech Republic',
  'Ungarn': 'Hungary',
  'Griechenland': 'Greece',
  'Türkei': 'Turkey',
  'Russland': 'Russia',
  'Vereinigtes Königreich': 'United Kingdom',
  'Vereinigte Staaten': 'United States',
  // French
  'Allemagne': 'Germany',
  'Suisse': 'Switzerland',
  'Autriche': 'Austria',
  'Pays-Bas': 'Netherlands',
  'Belgique': 'Belgium',
  'Danemark': 'Denmark',
  'Suède': 'Sweden',
  'Norvège': 'Norway',
  'Finlande': 'Finland',
  'Pologne': 'Poland',
  'Tchéquie': 'Czech Republic',
  'Hongrie': 'Hungary',
  'Grèce': 'Greece',
  'Turquie': 'Turkey',
  'Russie': 'Russia',
  'Royaume-Uni': 'United Kingdom',
  'États-Unis': 'United States',
  'Espagne': 'Spain',
  'Italie': 'Italy',
  'Portugal': 'Portugal',
  // Spanish
  'Alemania': 'Germany',
  'Suiza': 'Switzerland',
  'Países Bajos': 'Netherlands',
  'Bélgica': 'Belgium',
  'Dinamarca': 'Denmark',
  'Suecia': 'Sweden',
  'Noruega': 'Norway',
  'Finlandia': 'Finland',
  'Polonia': 'Poland',
  'Chequia': 'Czech Republic',
  'Hungría': 'Hungary',
  'Grecia': 'Greece',
  'Turquía': 'Turkey',
  'Rusia': 'Russia',
  'Reino Unido': 'United Kingdom',
  'Estados Unidos': 'United States',
  'España': 'Spain',
  'Italia': 'Italy',
  // Italian
  'Germania': 'Germany',
  'Svizzera': 'Switzerland',
  'Paesi Bassi': 'Netherlands',
  'Belgio': 'Belgium',
  'Danimarca': 'Denmark',
  'Svezia': 'Sweden',
  'Norvegia': 'Norway',
  'Turchia': 'Turkey',
  'Regno Unito': 'United Kingdom',
  'Stati Uniti': 'United States',
  'Spagna': 'Spain',
  // Japanese
  '日本': 'Japan',
  'アメリカ': 'United States',
  'イギリス': 'United Kingdom',
  'フランス': 'France',
  'ドイツ': 'Germany',
  'イタリア': 'Italy',
  'スペイン': 'Spain',
  '中国': 'China',
  '韓国': 'South Korea',
  'オーストラリア': 'Australia',
  'カナダ': 'Canada',
  // Chinese
  '美国': 'United States',
  '英国': 'United Kingdom',
  '法国': 'France',
  '德国': 'Germany',
  '意大利': 'Italy',
  '西班牙': 'Spain',
  '瑞士': 'Switzerland',
  '奥地利': 'Austria',
  '荷兰': 'Netherlands',
  '比利时': 'Belgium',
  '丹麦': 'Denmark',
  '瑞典': 'Sweden',
  '挪威': 'Norway',
  '芬兰': 'Finland',
  '波兰': 'Poland',
  '捷克': 'Czech Republic',
  '匈牙利': 'Hungary',
  '希腊': 'Greece',
  '土耳其': 'Turkey',
  '俄罗斯': 'Russia',
  '澳大利亚': 'Australia',
  '加拿大': 'Canada',
  '韩国': 'South Korea',
  '新加坡': 'Singapore',
  '泰国': 'Thailand',
  '越南': 'Vietnam',
  '印度': 'India',
  '印度尼西亚': 'Indonesia',
  '马来西亚': 'Malaysia',
  '菲律宾': 'Philippines',
  '新西兰': 'New Zealand',
  '墨西哥': 'Mexico',
  '巴西': 'Brazil',
  '阿根廷': 'Argentina',
  '南非': 'South Africa',
  '埃及': 'Egypt',
  '摩洛哥': 'Morocco',
  '葡萄牙': 'Portugal',
  '爱尔兰': 'Ireland',
  '苏格兰': 'Scotland',
  '冰岛': 'Iceland',
};

const COUNTRY_NAME_SET = new Set<string>(
  [
    ...Object.keys(COUNTRY_NAME_MAP),
    ...Object.values(COUNTRY_NAME_MAP),
  ].map(value => value.toLowerCase())
);

export function normalizeCountryName(country: string | null | undefined): string | null {
  if (!country) return null;
  const trimmed = country.trim();
  if (!trimmed) return null;
  return COUNTRY_NAME_MAP[trimmed] || trimmed;
}

export function isLikelyCountryName(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return false;
  return COUNTRY_NAME_SET.has(trimmed);
}
