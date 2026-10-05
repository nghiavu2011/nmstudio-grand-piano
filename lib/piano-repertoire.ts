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
  audioUrl?: string;
  audioDuration?: number;
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
    duration: '05:55',
    difficulty: 'Intermediate',
    style: 'Ballad / Emotive Grand Piano',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: '50-nam-ve-sau.mid',
    hasPerformance: true,
    audioUrl: '/audio_demo/50-nam-ve-sau.mp3',
    audioDuration: 354.95,
  },

  // 2. Bài Thánh Ca Buồn
  {
    id: 'bai-thanh-ca-buon',
    title: 'Bài Thánh Ca Buồn',
    composer: 'Nguyễn Vũ',
    country: 'Vietnam',
    category: 'VIETNAMESE',
    year: 1972,
    duration: '06:28',
    difficulty: 'Intermediate',
    style: 'Trữ Tình Sâu Lắng / Slow Expressive',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'bai-thanh-ca-buon.mid',
    hasPerformance: true,
    audioUrl: '/audio_demo/bai-thanh-ca-buon.mp3',
    audioDuration: 388.21,
  },

  // 3. Vết Mưa
  {
    id: 'vet-mua',
    title: 'Vết Mưa',
    composer: 'Vũ Cát Tường',
    country: 'Vietnam',
    category: 'VIETNAMESE',
    year: 2013,
    duration: '04:08',
    difficulty: 'Intermediate',
    style: 'Contemporary Ballad / Lyrical Flow',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'vet-mua.mid',
    hasPerformance: true,
    audioUrl: '/audio_demo/vet-mua.mp3',
    audioDuration: 248.24,
  },

  // 4. Close To You
  {
    id: 'close-to-you',
    title: '(They Long to Be) Close to You',
    composer: 'Burt Bacharach & The Carpenters',
    country: 'USA',
    category: 'INTERNATIONAL POP',
    year: 1970,
    duration: '04:00',
    difficulty: 'Intermediate',
    style: 'Romantic Pop / Warm Arpeggio',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'close-to-you.mid',
    hasPerformance: true,
    audioUrl: '/audio_demo/close-to-you.mp3',
    audioDuration: 240.48,
  },

  // 5. Golden Hour
  {
    id: 'golden-hour',
    title: 'Golden Hour',
    composer: 'JVKE',
    country: 'USA',
    category: 'INTERNATIONAL POP',
    year: 2022,
    duration: '03:48',
    difficulty: 'Advanced',
    style: 'Shimmering Arpeggios / Virtuosic Cascade',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'golden-hour.mid',
    hasPerformance: true,
    audioUrl: '/audio_demo/golden-hour.mp3',
    audioDuration: 228.00,
  },

  // 6. I'll Never Love Again
  {
    id: 'ill-never-love-again',
    title: "I'll Never Love Again",
    composer: 'Lady Gaga (A Star Is Born)',
    country: 'USA',
    category: 'INTERNATIONAL POP',
    year: 2018,
    duration: '04:41',
    difficulty: 'Intermediate',
    style: 'Cinematic Power Ballad / Dynamic Crescendo',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'ill-never-love-again.mid',
    hasPerformance: true,
    audioUrl: '/audio_demo/ill-never-love-again.mp3',
    audioDuration: 281.68,
  },

  // 7. Imagine
  {
    id: 'imagine',
    title: 'Imagine',
    composer: 'John Lennon',
    country: 'UK',
    category: 'INTERNATIONAL POP',
    year: 1971,
    duration: '03:21',
    difficulty: 'Easy',
    style: 'Iconic Grand Piano Motif / Timeless Classic',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'imagine.mid',
    hasPerformance: true,
    audioUrl: '/audio_demo/imagine.mp3',
    audioDuration: 201.67,
  },

  // 8. Last Christmas
  {
    id: 'last-christmas',
    title: 'Last Christmas',
    composer: 'George Michael (Wham!)',
    country: 'UK',
    category: 'INTERNATIONAL POP',
    year: 1984,
    duration: '07:37',
    difficulty: 'Intermediate',
    style: 'Holiday Pop / Bright Melodic Flow',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'last-christmas.mid',
    hasPerformance: true,
    audioUrl: '/audio_demo/last-christmas.mp3',
    audioDuration: 457.35,
  },

  // 9. Proud of You (I Can Fly)
  {
    id: 'proud-of-you',
    title: 'Proud of You (I Can Fly)',
    composer: 'Fiona Fung / Chan Kwong-wing',
    country: 'Hong Kong',
    category: 'INTERNATIONAL POP',
    year: 2003,
    duration: '03:29',
    difficulty: 'Easy',
    style: 'Uplifting Acoustic Melody / Pure Lyrical',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'proud-of-you.mid',
    hasPerformance: true,
    audioUrl: '/audio_demo/proud-of-you.mp3',
    audioDuration: 209.32,
  },

  // 10. Haru Haru
  {
    id: 'haru-haru',
    title: 'Haru Haru (하루하루)',
    composer: 'G-Dragon (BIGBANG)',
    country: 'South Korea',
    category: 'ASIAN POP',
    year: 2008,
    duration: '05:04',
    difficulty: 'Intermediate',
    style: 'Dramatic K-Pop Piano / Emotional Minor Flow',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'haru-haru.mid',
    hasPerformance: true,
    audioUrl: '/audio_demo/haru-haru.mp3',
    audioDuration: 304.54,
  },

  // 11. Sứ Thanh Hoa (青花瓷)
  {
    id: 'su-thanh-hoa',
    title: 'Sứ Thanh Hoa (青花瓷)',
    composer: 'Châu Kiệt Luân (Jay Chou)',
    country: 'Taiwan',
    category: 'ASIAN POP',
    year: 2007,
    duration: '04:18',
    difficulty: 'Intermediate',
    style: 'Pentatonic Chinese Wind / Poetic Piano',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'su-thanh-hoa.mid',
    hasPerformance: true,
    audioUrl: '/audio_demo/su-thanh-hoa.mp3',
    audioDuration: 258.35,
  },

  // 12. 蒲公英的约定 (Dandelion's Promise)
  {
    id: 'dandelions-promise',
    title: '蒲公英的约定 (Hẹn Ước Bồ Công Anh)',
    composer: 'Châu Kiệt Luân (Jay Chou)',
    country: 'Taiwan',
    category: 'ASIAN POP',
    year: 2007,
    duration: '05:18',
    difficulty: 'Intermediate',
    style: 'Nostalgic Youth Ballad / Gentle Resonance',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'dandelions-promise.mid',
    hasPerformance: true,
    audioUrl: '/audio_demo/dandelions-promise.mp3',
    audioDuration: 317.86,
  },

  // 13. Interstellar
  {
    id: 'interstellar',
    title: 'Interstellar (Main Theme)',
    composer: 'Hans Zimmer',
    country: 'USA / Germany',
    category: 'CINEMATIC',
    year: 2014,
    duration: '04:46',
    difficulty: 'Advanced',
    style: 'Cosmic / Wide Resonance Build',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'interstellar.mid',
    hasPerformance: true,
    audioUrl: '/audio_demo/interstellar.mp3',
    audioDuration: 286.41,
  },

  // 14. Merry-Go-Round of Life
  {
    id: 'merry-go-round',
    title: "Merry-Go-Round of Life (Howl's Moving Castle)",
    composer: 'Joe Hisaishi',
    country: 'Japan',
    category: 'CINEMATIC',
    year: 2004,
    duration: '05:28',
    difficulty: 'Advanced',
    style: 'Theatrical Waltz / 3/4 Rubato',
    source: 'N&Mstudio Concert Solo arrangement',
    rightsStatus: 'licensed',
    file: 'merry-go-round-of-life.mid',
    hasPerformance: true,
    audioUrl: '/audio_demo/merry-go-round-of-life.mp3',
    audioDuration: 327.84,
  },
];

// Full Repertoire Registry
export const REPERTOIRE = REPERTOIRE_REGISTRY;
