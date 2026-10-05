/**
 * N&Mstudio Grand Piano — Professional Repertoire Registry V3
 * Curated user collection: 14 legendary global & Vietnamese pieces, plus Atelier Prelude.
 */

export type RepertoireCategory =
  | 'N&M ORIGINAL'
  | 'VIETNAMESE'
  | 'INTERNATIONAL POP'
  | 'CINEMATIC'
  | 'ASIAN POP';

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
  // 0. N&Mstudio Original Intro
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

  // 1. 50 NĂM VỀ SAU
  {
    id: '50-nam-ve-sau',
    title: '50 Năm Về Sau',
    composer: 'Nhạc Trữ Tình Việt Nam',
    country: 'Vietnam',
    category: 'VIETNAMESE',
    year: 2023,
    duration: '03:15',
    difficulty: 'Intermediate',
    style: 'Ballad / Emotive Grand Piano',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: '50-nam-ve-sau.mid',
    hasPerformance: true,
  },

  // 2. Bài Thánh Ca Buồn
  {
    id: 'bai-thanh-ca-buon',
    title: 'Bài Thánh Ca Buồn',
    composer: 'Nguyễn Vũ',
    country: 'Vietnam',
    category: 'VIETNAMESE',
    year: 1972,
    duration: '03:32',
    difficulty: 'Intermediate',
    style: 'Trữ Tình Sâu Lắng / Slow Expressive',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'bai-thanh-ca-buon.mid',
    hasPerformance: true,
  },

  // 3. Vết Mưa
  {
    id: 'vet-mua',
    title: 'Vết Mưa',
    composer: 'Vũ Cát Tường',
    country: 'Vietnam',
    category: 'VIETNAMESE',
    year: 2013,
    duration: '02:40',
    difficulty: 'Intermediate',
    style: 'Contemporary Ballad / Lyrical Flow',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'vet-mua.mid',
    hasPerformance: true,
  },

  // 4. Close To You
  {
    id: 'close-to-you',
    title: '(They Long to Be) Close to You',
    composer: 'Burt Bacharach & The Carpenters',
    country: 'USA',
    category: 'INTERNATIONAL POP',
    year: 1970,
    duration: '02:50',
    difficulty: 'Intermediate',
    style: 'Romantic Pop / Warm Arpeggio',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'close-to-you.mid',
    hasPerformance: true,
  },

  // 5. Golden Hour
  {
    id: 'golden-hour',
    title: 'Golden Hour',
    composer: 'JVKE',
    country: 'USA',
    category: 'INTERNATIONAL POP',
    year: 2022,
    duration: '02:45',
    difficulty: 'Advanced',
    style: 'Shimmering Arpeggios / Virtuosic Cascade',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'golden-hour.mid',
    hasPerformance: true,
  },

  // 6. I'll Never Love Again
  {
    id: 'ill-never-love-again',
    title: "I'll Never Love Again",
    composer: 'Lady Gaga (A Star Is Born)',
    country: 'USA',
    category: 'INTERNATIONAL POP',
    year: 2018,
    duration: '03:10',
    difficulty: 'Intermediate',
    style: 'Cinematic Power Ballad / Dynamic Crescendo',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'ill-never-love-again.mid',
    hasPerformance: true,
  },

  // 7. Imagine
  {
    id: 'imagine',
    title: 'Imagine',
    composer: 'John Lennon',
    country: 'UK',
    category: 'INTERNATIONAL POP',
    year: 1971,
    duration: '03:05',
    difficulty: 'Easy',
    style: 'Iconic Grand Piano Motif / Timeless Classic',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'imagine.mid',
    hasPerformance: true,
  },

  // 8. Last Christmas
  {
    id: 'last-christmas',
    title: 'Last Christmas',
    composer: 'George Michael (Wham!)',
    country: 'UK',
    category: 'INTERNATIONAL POP',
    year: 1984,
    duration: '03:20',
    difficulty: 'Intermediate',
    style: 'Holiday Pop / Bright Melodic Flow',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'last-christmas.mid',
    hasPerformance: true,
  },

  // 9. Proud of You (I Can Fly)
  {
    id: 'proud-of-you',
    title: 'Proud of You (I Can Fly)',
    composer: 'Fiona Fung / Chan Kwong-wing',
    country: 'Hong Kong',
    category: 'INTERNATIONAL POP',
    year: 2003,
    duration: '02:35',
    difficulty: 'Easy',
    style: 'Uplifting Acoustic Melody / Pure Lyrical',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'proud-of-you.mid',
    hasPerformance: true,
  },

  // 10. Haru Haru
  {
    id: 'haru-haru',
    title: 'Haru Haru (하루하루)',
    composer: 'G-Dragon (BIGBANG)',
    country: 'South Korea',
    category: 'ASIAN POP',
    year: 2008,
    duration: '03:12',
    difficulty: 'Intermediate',
    style: 'Dramatic K-Pop Piano / Emotional Minor Flow',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'haru-haru.mid',
    hasPerformance: true,
  },

  // 11. Sứ Thanh Hoa (青花瓷)
  {
    id: 'su-thanh-hoa',
    title: 'Sứ Thanh Hoa (青花瓷)',
    composer: 'Châu Kiệt Luân (Jay Chou)',
    country: 'Taiwan',
    category: 'ASIAN POP',
    year: 2007,
    duration: '02:55',
    difficulty: 'Intermediate',
    style: 'Pentatonic Chinese Wind / Poetic Piano',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'su-thanh-hoa.mid',
    hasPerformance: true,
  },

  // 12. 蒲公英的约定 (Dandelion's Promise)
  {
    id: 'dandelions-promise',
    title: '蒲公英的约定 (Hẹn Ước Bồ Công Anh)',
    composer: 'Châu Kiệt Luân (Jay Chou)',
    country: 'Taiwan',
    category: 'ASIAN POP',
    year: 2007,
    duration: '03:00',
    difficulty: 'Intermediate',
    style: 'Nostalgic Youth Ballad / Gentle Resonance',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'dandelions-promise.mid',
    hasPerformance: true,
  },

  // 13. Interstellar
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

  // 14. Merry-Go-Round of Life
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
