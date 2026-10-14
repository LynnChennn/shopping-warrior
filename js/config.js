// 購物戰士 — 固定設定

export const SYM = { JPY: '¥', TWD: 'NT$', USD: 'US$', KRW: '₩' };
export const DEC = { JPY: 0, TWD: 0, USD: 2, KRW: 0 };

// 預設匯率（可在畫面上修改）
export const DEFAULT_RATES = { JPY: 0.215, TWD: 1, USD: 32.5, KRW: 0.024 };

// 內建常用日本店家（規格書 §5.2）
export const PRESETS = [
  { id: 'daikoku', name: '大國藥妝', ja: 'ダイコクドラッグ' },
  { id: 'donki', name: '唐吉訶德', ja: 'ドン・キホーテ' },
  { id: 'bic', name: 'Bic Camera', ja: 'ビックカメラ' },
  { id: 'muji', name: 'MUJI 無印良品', ja: '無印良品' },
  { id: 'uniqlo', name: 'Uniqlo', ja: 'ユニクロ' },
];
export const presetById = id => PRESETS.find(p => p.id === id);
