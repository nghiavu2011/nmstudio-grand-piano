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

  // 2. Classical (Public Domain)
  {
    id: 'canon',
    title: 'Canon in D',
    composer: 'Johann Pachelbel',
    country: 'Germany',
    category: 'CLASSICAL',
    year: 1680,
    duration: '01:46',
    difficulty: 'Intermediate',
    style: 'Baroque / Polyphonic Grand Piano',
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
    duration: '00:51',
    difficulty: 'Intermediate',
    style: 'Romantic / Classical Bagatelle',
    source: 'N&Mstudio Two-Hand Classical Solo arrangement',
    rightsStatus: 'public-domain',
    file: 'fur-elise.mid',
    hasPerformance: true,
  },

  // 3. Vietnamese Piano Library
  {
    id: 'beo-dat',
    title: 'Bèo Dạt Mây Trôi',
    composer: 'Dân Ca Quan Họ Bắc Ninh',
    country: 'Vietnam',
    category: 'VIETNAMESE',
    year: 'Truyền thống',
    duration: '01:32',
    difficulty: 'Intermediate',
    style: 'Impressionist Pentatonic Folk / Solo Piano',
    source: 'N&Mstudio original two-hand piano arrangement',
    rightsStatus: 'public-domain',
    file: 'beo-dat-may-troi.mid',
    hasPerformance: true,
  },
  {
    id: 'diem-xua',
    title: 'Diễm Xưa',
    composer: 'Trịnh Công Sơn',
    country: 'Vietnam',
    category: 'VIETNAMESE',
    year: 1960,
    duration: '01:09',
    difficulty: 'Intermediate',
    style: 'Trữ Tình / Lyrical Romantic',
    source: 'N&Mstudio arrangement',
    rightsStatus: 'licensed',
    file: 'diem-xua.mid',
    hasPerformance: true,
  },
  {
    id: 'me-yeu-con',
    title: 'Mẹ Yêu Con',
    composer: 'Nguyễn Văn Tý',
    country: 'Vietnam',
    category: 'VIETNAMESE',
    year: 1956,
    duration: '00:47',
    difficulty: 'Intermediate',
    style: 'Quê Hương / Vocal Melody',
    source: 'N&Mstudio arrangement',
    rightsStatus: 'licensed',
    file: 'me-yeu-con.mid',
    hasPerformance: true,
  },

  // 4. Modern Piano
  {
    id: 'river-flows',
    title: 'River Flows in You',
    composer: 'Yiruma',
    country: 'South Korea',
    category: 'MODERN PIANO',
    year: 2001,
    duration: '00:50',
    difficulty: 'Intermediate',
    style: 'Contemporary / New Age Lyrical',
    source: 'N&Mstudio arrangement',
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
    duration: '00:38',
    difficulty: 'Intermediate',
    style: 'Emotional / Arpeggiated Ballad',
    source: 'N&Mstudio arrangement',
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
    duration: '00:27',
    difficulty: 'Intermediate',
    style: 'Minimalist / Emotional Crescendo',
    source: 'N&Mstudio arrangement',
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
    duration: '00:31',
    difficulty: 'Intermediate',
    style: 'Romantic Concert Pop',
    source: 'N&Mstudio arrangement',
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
    duration: '01:49',
    difficulty: 'Intermediate',
    style: 'Cinematic / Ostinato Build',
    source: 'N&Mstudio arrangement',
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
    duration: '00:31',
    difficulty: 'Advanced',
    style: 'Cosmic / Wide Resonance Build',
    source: 'N&Mstudio arrangement',
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
    duration: '00:15',
    difficulty: 'Advanced',
    style: 'Theatrical Waltz / 3/4 Rubato',
    source: 'N&Mstudio arrangement',
    rightsStatus: 'licensed',
    file: 'merry-go-round-of-life.mid',
    hasPerformance: true,
  },
];

// Full Repertoire Registry
export const REPERTOIRE = REPERTOIRE_REGISTRY;
