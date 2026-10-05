/**
 * N&Mstudio Grand Piano — Professional Repertoire Registry V2
 * Comprehensive musical metadata, rights management, and performance paths.
 */

export type RepertoireCategory =
  | 'N&M ORIGINAL'
  | 'CLASSICAL'
  | 'MODERN PIANO'
  | 'CINEMATIC'
  | 'VIETNAMESE';

export type RightsStatus =
  | 'public-domain'
  | 'original'
  | 'licensed'
  | 'metadata-only';

export type RepertoireItem = {
  id: string;
  title: string;
  composer: string;
  country: string;
  category: RepertoireCategory;
  year: number | string;
  duration: string;
  difficulty: 'Easy' | 'Intermediate' | 'Advanced';
  style: string;
  source: string;
  rightsStatus: RightsStatus;
  file: string;
  hasPerformance: boolean;
};

export const REPERTOIRE_REGISTRY: RepertoireItem[] = [
  // 1. N&Mstudio Originals
  {
    id: 'prelude',
    title: 'Atelier Prelude',
    composer: 'Anionex & N&Mstudio',
    country: 'International',
    category: 'N&M ORIGINAL',
    year: 2024,
    duration: '00:43',
    difficulty: 'Easy',
    style: 'Neoclassical / Minimalist',
    source: 'N&Mstudio procedural acoustic sequence',
    rightsStatus: 'original',
    file: 'prelude',
    hasPerformance: true,
  },

  // 2. Classical Repertoire (Full Length Concert Benchmarks)
  {
    id: 'canon',
    title: 'Canon in D',
    composer: 'Johann Pachelbel',
    country: 'Germany',
    category: 'CLASSICAL',
    year: 1680,
    duration: '03:28',
    difficulty: 'Intermediate',
    style: 'Baroque / Polyphonic Concert Solo',
    source: 'N&Mstudio Two-Hand Concert Solo arrangement',
    rightsStatus: 'public-domain',
    file: 'canon-in-d.mid',
    hasPerformance: true,
  },
  {
    id: 'elise',
    title: 'Für Elise (WoO 59)',
    composer: 'Ludwig van Beethoven',
    country: 'Germany',
    category: 'CLASSICAL',
    year: 1810,
    duration: '01:45',
    difficulty: 'Intermediate',
    style: 'Romantic / Classical Bagatelle',
    source: 'N&Mstudio Two-Hand Classical Solo arrangement',
    rightsStatus: 'public-domain',
    file: 'fur-elise.mid',
    hasPerformance: true,
  },

  // 3. Vietnamese Virtuosic & Lyrical Piano Collection
  {
    id: 'co-chang-trai',
    title: 'Có Chàng Trai Viết Lên Cây',
    composer: 'Phan Mạnh Quỳnh (OST Mắt Biếc)',
    country: 'Vietnam',
    category: 'VIETNAMESE',
    year: 2019,
    duration: '02:45',
    difficulty: 'Intermediate',
    style: 'Trữ Tình Hiện Đại / Lyrical Ballad',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'co-chang-trai-viet-len-cay.mid',
    hasPerformance: true,
  },
  {
    id: 'nham-mat',
    title: 'Nhắm Mắt Thấy Mùa Hè',
    composer: 'Hồ Tiến Đạt (OST Nhắm Mắt Thấy Mùa Hè)',
    country: 'Vietnam',
    category: 'VIETNAMESE',
    year: 2018,
    duration: '02:42',
    difficulty: 'Intermediate',
    style: 'Cinematic Ballad / Impressionist Flow',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'nham-mat-thay-mua-he.mid',
    hasPerformance: true,
  },
  {
    id: 'hanh-phuc-moi',
    title: 'Hạnh Phúc Mới',
    composer: 'Sơn Tùng M-TP & Hari Won (OST Chàng Trai Năm Ấy)',
    country: 'Vietnam',
    category: 'VIETNAMESE',
    year: 2014,
    duration: '02:38',
    difficulty: 'Intermediate',
    style: 'Romantic Ballad / Emotive Grand Piano',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'hanh-phuc-moi.mid',
    hasPerformance: true,
  },
  {
    id: 'phep-mau',
    title: 'Phép Màu',
    composer: 'Tác Phẩm Piano Điêu Luyện',
    country: 'Vietnam',
    category: 'VIETNAMESE',
    year: 2021,
    duration: '02:29',
    difficulty: 'Advanced',
    style: 'Virtuoso Solo / Dramatic Arpeggios',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'phep-mau.mid',
    hasPerformance: true,
  },
  {
    id: 'beo-dat',
    title: 'Bèo Dạt Mây Trôi',
    composer: 'Dân Ca Quan Họ Bắc Ninh',
    country: 'Vietnam',
    category: 'VIETNAMESE',
    year: 'Truyền thống',
    duration: '01:54',
    difficulty: 'Intermediate',
    style: 'Concert Rhapsody / Pentatonic Solo',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'public-domain',
    file: 'beo-dat-may-troi.mid',
    hasPerformance: true,
  },

  // 4. Modern & Contemporary Piano
  {
    id: 'river-flows',
    title: 'River Flows in You',
    composer: 'Yiruma',
    country: 'South Korea',
    category: 'MODERN PIANO',
    year: 2001,
    duration: '02:56',
    difficulty: 'Intermediate',
    style: 'Contemporary / New Age Lyrical',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'river-flows-in-you.mid',
    hasPerformance: true,
  },
  {
    id: 'kiss-the-rain',
    title: 'Kiss the Rain',
    composer: 'Yiruma',
    country: 'South Korea',
    category: 'MODERN PIANO',
    year: 2003,
    duration: '03:08',
    difficulty: 'Intermediate',
    style: 'Emotional / Arpeggiated Ballad',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'kiss-the-rain.mid',
    hasPerformance: true,
  },
  {
    id: 'nuvole-bianche',
    title: 'Nuvole Bianche',
    composer: 'Ludovico Einaudi',
    country: 'Italy',
    category: 'MODERN PIANO',
    year: 2004,
    duration: '03:04',
    difficulty: 'Intermediate',
    style: 'Minimalist / Emotional Crescendo',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'nuvole-bianche.mid',
    hasPerformance: true,
  },
  {
    id: 'mariage-damour',
    title: "Mariage d'Amour",
    composer: 'Paul de Senneville',
    country: 'France',
    category: 'MODERN PIANO',
    year: 1979,
    duration: '02:30',
    difficulty: 'Intermediate',
    style: 'Romantic Concert Pop',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'mariage-damour.mid',
    hasPerformance: true,
  },

  // 5. Cinematic Piano
  {
    id: 'time',
    title: 'Time (Inception)',
    composer: 'Hans Zimmer',
    country: 'USA / Germany',
    category: 'CINEMATIC',
    year: 2010,
    duration: '03:24',
    difficulty: 'Intermediate',
    style: 'Cinematic / Grand Orchestral Build',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'time-inception.mid',
    hasPerformance: true,
  },
  {
    id: 'interstellar',
    title: 'Interstellar (Main Theme)',
    composer: 'Hans Zimmer',
    country: 'USA / Germany',
    category: 'CINEMATIC',
    year: 2014,
    duration: '03:18',
    difficulty: 'Advanced',
    style: 'Cosmic / Wide Resonance Build',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'interstellar.mid',
    hasPerformance: true,
  },
  {
    id: 'merry-go-round',
    title: "Merry-Go-Round of Life (Howl's Moving Castle)",
    composer: 'Joe Hisaishi',
    country: 'Japan',
    category: 'CINEMATIC',
    year: 2004,
    duration: '03:00',
    difficulty: 'Advanced',
    style: 'Theatrical Waltz / 3/4 Rubato',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'merry-go-round-of-life.mid',
    hasPerformance: true,
  },
];

// Full Repertoire Registry
export const REPERTOIRE = REPERTOIRE_REGISTRY;
