/**
 * Pritzker Prize Architects
 * 普利兹克建筑奖获奖建筑师数据
 * 
 * 用于检测建筑师是否获得过普利兹克奖
 * 数据来源：https://www.pritzkerprize.com/laureates
 */

// 普利兹克奖获奖建筑师及年份
export const PRITZKER_ARCHITECTS: Record<string, number> = {
  // 1979-1989
  'Philip Johnson': 1979,
  'Luis Barragán': 1980,
  'Luis Barragan': 1980,
  'James Stirling': 1981,
  'Kevin Roche': 1982,
  'I. M. Pei': 1983,
  'I.M. Pei': 1983,
  'Ieoh Ming Pei': 1983,
  'Richard Meier': 1984,
  'Hans Hollein': 1985,
  'Gottfried Böhm': 1986,
  'Gottfried Bohm': 1986,
  'Kenzo Tange': 1987,
  '丹下健三': 1987,
  'Gordon Bunshaft': 1988,
  'Oscar Niemeyer': 1988,
  'Frank Gehry': 1989,
  'Frank O. Gehry': 1989,
  
  // 1990-1999
  'Aldo Rossi': 1990,
  'Robert Venturi': 1991,
  'Álvaro Siza': 1992,
  'Alvaro Siza': 1992,
  'Álvaro Siza Vieira': 1992,
  'Fumihiko Maki': 1993,
  '槇文彦': 1993,
  'Christian de Portzamparc': 1994,
  'Tadao Ando': 1995,
  '安藤忠雄': 1995,
  'Rafael Moneo': 1996,
  'José Rafael Moneo': 1996,
  'Sverre Fehn': 1997,
  'Renzo Piano': 1998,
  'Norman Foster': 1999,
  'Lord Norman Foster': 1999,
  
  // 2000-2009
  'Rem Koolhaas': 2000,
  'Herzog & de Meuron': 2001,
  'Jacques Herzog': 2001,
  'Pierre de Meuron': 2001,
  'Glenn Murcutt': 2002,
  'Jørn Utzon': 2003,
  'Jorn Utzon': 2003,
  'Zaha Hadid': 2004,
  '扎哈·哈迪德': 2004,
  'Thom Mayne': 2005,
  'Paulo Mendes da Rocha': 2006,
  'Richard Rogers': 2007,
  'Lord Richard Rogers': 2007,
  'Jean Nouvel': 2008,
  'Peter Zumthor': 2009,
  
  // 2010-2019
  'SANAA': 2010,
  'Kazuyo Sejima': 2010,
  '妹島和世': 2010,
  'Ryue Nishizawa': 2010,
  '西沢立衛': 2010,
  'Eduardo Souto de Moura': 2011,
  'Wang Shu': 2012,
  '王澍': 2012,
  'Toyo Ito': 2013,
  '伊東豊雄': 2013,
  'Shigeru Ban': 2014,
  '坂茂': 2014,
  'Frei Otto': 2015,
  'Alejandro Aravena': 2016,
  'RCR Arquitectes': 2017,
  'Rafael Aranda': 2017,
  'Carme Pigem': 2017,
  'Ramon Vilalta': 2017,
  'Balkrishna Doshi': 2018,
  'B. V. Doshi': 2018,
  'Arata Isozaki': 2019,
  '磯崎新': 2019,
  
  // 2020-2024
  'Yvonne Farrell': 2020,
  'Shelley McNamara': 2020,
  'Grafton Architects': 2020,
  'Anne Lacaton': 2021,
  'Jean-Philippe Vassal': 2021,
  'Lacaton & Vassal': 2021,
  'Diébédo Francis Kéré': 2022,
  'Francis Kéré': 2022,
  'Francis Kere': 2022,
  'David Chipperfield': 2023,
  'Sir David Chipperfield': 2023,
  'Riken Yamamoto': 2024,
  '山本理顕': 2024,
};

// 建筑师名称变体映射（用于模糊匹配）
export const ARCHITECT_NAME_VARIANTS: Record<string, string> = {
  'pei': 'I. M. Pei',
  'gehry': 'Frank Gehry',
  'hadid': 'Zaha Hadid',
  'ando': 'Tadao Ando',
  'koolhaas': 'Rem Koolhaas',
  'piano': 'Renzo Piano',
  'foster': 'Norman Foster',
  'nouvel': 'Jean Nouvel',
  'zumthor': 'Peter Zumthor',
  'sejima': 'Kazuyo Sejima',
  'nishizawa': 'Ryue Nishizawa',
  'ban': 'Shigeru Ban',
  'ito': 'Toyo Ito',
  'isozaki': 'Arata Isozaki',
  'chipperfield': 'David Chipperfield',
  'kere': 'Francis Kéré',
};

/**
 * 检测建筑师是否获得过普利兹克奖
 * @param architectName 建筑师名称
 * @returns 获奖年份，如果未获奖则返回 null
 */
export function getPritzkerYear(architectName: string): number | null {
  if (!architectName) return null;
  
  // 直接匹配
  if (PRITZKER_ARCHITECTS[architectName]) {
    return PRITZKER_ARCHITECTS[architectName];
  }
  
  // 尝试变体匹配
  const lowerName = architectName.toLowerCase();
  for (const [variant, fullName] of Object.entries(ARCHITECT_NAME_VARIANTS)) {
    if (lowerName.includes(variant)) {
      return PRITZKER_ARCHITECTS[fullName] || null;
    }
  }
  
  // 模糊匹配（检查名称是否包含在已知建筑师中）
  for (const [name, year] of Object.entries(PRITZKER_ARCHITECTS)) {
    if (name.toLowerCase().includes(lowerName) || lowerName.includes(name.toLowerCase())) {
      return year;
    }
  }
  
  return null;
}

/**
 * 检测建筑师并返回相关标签
 * @param architectName 建筑师名称
 * @returns 标签数组 ['pritzker', 'pritzker_year:YYYY'] 或空数组
 */
export function detectPritzkerTags(architectName: string): string[] {
  const year = getPritzkerYear(architectName);
  if (year) {
    return ['pritzker', `pritzker_year:${year}`];
  }
  return [];
}

/**
 * 检查建筑师是否是普利兹克奖获得者
 */
export function isPritzkerArchitect(architectName: string): boolean {
  return getPritzkerYear(architectName) !== null;
}
