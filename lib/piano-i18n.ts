export type Locale = 'en' | 'zh';

export function browserLocale(languages: readonly string[] = []): Locale {
  return /^zh(?:-|_|$)/i.test(languages.find(language => language.trim()) ?? '') ? 'zh' : 'en';
}

export const ENGLISH: Record<string, string> = {
  '音乐厅': 'Concert Hall', '日光工作室': 'Daylight Studio', '月夜露台': 'Moonlit Terrace',
  '柔音': 'Soft', '选择延音': 'Sostenuto', '延音': 'Sustain', '左 Shift': 'Left Shift', '右 Shift': 'Right Shift',
  '移动击弦机构，降低音量并柔化音色': 'Shifts the action for a softer, quieter tone',
  '仅保持踩下瞬间已按住的音符': 'Sustains only the notes held when pressed',
  '抬起全部制音器，松开后止音': 'Lifts all dampers; release to damp the strings',
  '读取钢琴状态': 'Read piano state', '调整钢琴环境与视角': 'Change piano environment and view',
  '3D 场景不可用。请启用浏览器硬件加速并刷新；下方琴键仍可演奏。': '3D is unavailable. Enable browser hardware acceleration and refresh. The on-screen keys remain playable.',
  '内置乐谱尚未载入，请稍后重试。': 'The score is still loading. Please try again shortly.',
  'MIDI 最大 2 MB。': 'MIDI files must be at most 2 MB.',
  'MIDI 读取失败，请检查文件。': 'Could not read the MIDI file. Please check the file.',
  '请等待乐谱载入完成。': 'Please wait for the score to load.',
  '录制失败，请使用支持 MediaRecorder 的浏览器。': 'Recording failed. Use a browser that supports MediaRecorder.',
  '可交互三角钢琴 3D 场景': 'Interactive 3D grand piano',
  '进入沉浸模式': 'Enter immersive mode', '沉浸模式': 'Immersive mode', '沉浸': 'Immerse',
  '立体声采样已就绪': 'Stereo samples ready', '音色加载中…': 'Loading samples…', '重试加载音色': 'Retry samples', '开启声音': 'Enable sound',
  '演奏指南': 'Playing guide', '全屏': 'Fullscreen',
  '当前窗口不支持全屏，可在浏览器中打开演奏。': 'Fullscreen is unavailable in this window. Open the site in a browser.',
  '显示沉浸模式控制': 'Show immersive controls', '沉浸模式控制': 'Immersive controls', '沉浸环境': 'Environment', '沉浸视角': 'Camera view',
  '全景': 'Overview', '靠近演奏': 'Play close-up', '机械观察': 'Inside the action',
  '合盖': 'Close lid', '开盖': 'Open lid', '暂停示奏': 'Pause', '继续示奏': 'Resume', '聆听示奏': 'Listen', '退出沉浸模式': 'Exit immersive mode',
  '指尖之下，万千共鸣。': 'A world of resonance, at your fingertips.', '环境选择': 'Choose an environment',
  '音色与琴盖设置': 'Sound and lid settings', '声音与细节': 'Sound & details', '关闭设置': 'Close settings',
  '音量': 'Volume', '空间混响': 'Room reverb', '击键力度': 'Touch velocity', '轻柔': 'Soft', '适中': 'Medium', '有力': 'Strong', '开启琴盖': 'Open lid',
  '环境切换会同步改变光照与空间声学。': 'Each environment changes both lighting and room acoustics.',
  '看见声音的诞生': 'See sound take shape', '外壳已揭开。按下琴键，观察击弦过程。': 'The case is opened. Play a key to explore the action.',
  '琴键下沉 · 后端抬起': 'Key descends · tail rises', '联动杆推动顶杆': 'Wippen drives the jack', '琴槌上击后回落': 'Hammer strikes and rebounds', '制音器抬起 · 琴弦振动': 'Damper lifts · strings vibrate',
  '慢动作观察': 'Slow motion', '仅放慢机械动画': 'Visual motion only',
  '点击 3D 琴键即可弹奏 · 也可使用下方键盘': 'Play the 3D keys or the keyboard below',
  '拖动旋转 · 滚轮拉近 · 双指缩放': 'Drag to orbit · scroll or pinch to zoom',
  '重置视角': 'Reset view', '演奏控制台': 'Performance controls', '示奏曲目': 'Repertoire',
  'Atelier Prelude · 原创示奏': 'Atelier Prelude · Original', '导入 ·': 'Imported ·', '导入 MIDI': 'Import MIDI',
  '文件仅在当前浏览器会话中读取，不上传': 'Read locally in this browser session; never uploaded',
  '展开演奏面板': 'Expand keyboard', '最小化演奏面板': 'Minimize keyboard', '示奏进度，可拖动跳转': 'Playback position; drag to seek',
  '实录中': 'Recording', '自动演奏': 'Auto play', '自由演奏': 'Free play', '降低八度': 'Lower octave', '升高八度': 'Raise octave', '乐谱载入中': 'Loading score',
  '按住弹奏，松开止音': 'Hold to play, release to damp', '释放全部音符与踏板': 'Release all notes and pedals', 'Esc · 释放全部': 'Esc · Release all',
  '正在调校琴弦与光线…': 'Tuning strings and light…', '关闭提示': 'Dismiss message', '演奏指南与音源': 'Guide & sound credits',
  '让每一次触键，都有回响。': 'Let every touch resonate.', 'Grand Atelier · 演奏与观察指南': 'Grand Atelier · Playing & exploration guide', '开始演奏': 'Start playing',
  '先点击「开启声音」。选择「靠近演奏」，直接按住 3D 琴键，或点击下方屏幕琴键。拖过琴键可滑奏，多点触控可弹和弦。': 'Click “Enable sound”, then “Play close-up”. Hold the 3D or on-screen keys to play. Drag across keys for a glissando; use multiple touches for chords.',
  '从演奏者视角，左低右高。中央 C 是从左数第 40 个琴键、第 24 个白键：C4 / MIDI 60 / 261.63 Hz。琴键上有 C4 标记。': 'From the player’s position, low notes are on the left. Middle C is the 40th key and 24th white key from the left: C4 / MIDI 60 / 261.63 Hz. It is marked on the keyboard.',
  '对应白键；上排': ' play white keys; the upper row', '对应黑键。方向键': ' plays black keys. Arrow keys ', '切换八度，': 'change octave; ', '立即释放全部音符与踏板。': ' releases all notes and pedals immediately.',
  '《Kiss the Rain》（Yiruma）已内置，选择后直接演奏，曲目文件由站点所有者提供。另可导入自己的钢琴 MIDI：保留原始音高、变速、音符起止、力度及三踏板，不量化、不自动移调。导入文件只在当前浏览器会话中读取，不上传。': 'Kiss the Rain by Yiruma is built in: select it to play. Repertoire files are supplied by the site owner. You can also import piano MIDI, preserving pitch, tempo changes, note timing, velocity and all three pedals without quantization or transposition. Imported files stay in this browser session and are never uploaded.',
  '谱架按小节显示 MIDI 转写谱：拍号、调号、临时升降与还原记号、休止符、附点、延音线及踏板线随曲目生成，按播放位置自动翻页。谱面以三十二分音符网格整理演奏时差，音频仍使用原始时间；未提供的调号按无升降调号显示，指法和表情不猜测。自由演奏记谱采用 120 BPM。': 'The desk displays a MIDI transcription with time and key signatures, accidentals, rests, dots, ties and pedal lines, turning pages with playback. Notation uses a 32nd-note grid; audio retains original timing. Missing key signatures are shown without sharps or flats. Fingering and expression are not inferred. Free-play notation uses 120 BPM.',
  '三枚踏板': 'Three pedals', '。按住踩下，松开释放。': '. Hold to press; release to lift.', '观察机械': 'Explore the mechanism',
  '切换「机械观察」后，遮挡部件会揭开。每个音符都有独立的琴键、联动杆、顶杆、琴槌和制音器。慢动作仅放慢视觉，不改变音高或声音速度。高音区按真实结构不设制音器。': '“Inside the action” opens the covering parts. Each note has its own key, wippen, jack and hammer; the upper treble has no dampers, as on a real piano. Slow motion changes only the animation, not pitch or playback speed.',
  '这是以真实工作原理搭建的可视化模型，并非某一品牌的工程复刻。琴弦振幅为便于观察有所放大。': 'This visualization follows real mechanical principles, rather than replicating a specific brand’s engineering. String vibration is exaggerated for visibility.',
  '音源：': 'Sound: ', '。采用 Tone.js 分发的 30 个 MP3 采样，经过实时移调、力度滤波与混响处理。Three.js 实时渲染。': '. Uses 30 MP3 samples distributed by Tone.js, with real-time pitch shifting, velocity filtering and reverb. Rendered in real time with Three.js.',
  '晴天 · 周杰伦': 'Sunny Day · Jay Chou', 'Cornfield Chase · 星际穿越': 'Cornfield Chase · Interstellar', '野蜂飞舞': 'Flight of the Bumblebee', '克罗地亚狂想曲': 'Croatian Rhapsody',
  '请选择有效的 MIDI 文件（最大 2 MB）。': 'Choose a valid MIDI file (at most 2 MB).',
  '支持 Format 0/1、PPQ 时基的 MIDI；不支持异步轨道或 SMPTE 时基。': 'MIDI formats 0/1 with PPQ timing are supported; asynchronous tracks and SMPTE timing are not.',
  'MIDI 时间数据损坏。': 'The MIDI timing data is invalid.', 'MIDI 事件过多，请导出更短的钢琴片段。': 'Too many MIDI events. Export a shorter piano excerpt.',
  'MIDI 速度数据无效。': 'Invalid MIDI tempo data.', '此文件包含弯音，不能在固定音高的钢琴上准确还原。': 'This file contains pitch bends, which cannot be reproduced accurately on a fixed-pitch piano.',
  '请导出仅含钢琴的 MIDI；此文件包含打击乐或非钢琴音轨。': 'Export a piano-only MIDI; this file contains percussion or non-piano tracks.',
  '文件含超出 A0–C8 的音符；不会静默移调或丢弃。': 'Notes fall outside A0–C8; they will not be silently transposed or discarded.',
  'MIDI 含未配对的松键事件。': 'The MIDI contains unmatched note-off events.', 'MIDI 含零时长或负时长音符。': 'The MIDI contains notes with zero or negative duration.',
  '连续踏板值按 MIDI 标准阈值 64 转为踩下/松开，不模拟半踏板。': 'Continuous pedal values use the MIDI threshold of 64 for on/off; half-pedaling is not simulated.',
  '音符、力度、变速与三踏板已保留；其他控制器不参与音色处理。': 'Notes, velocity, tempo changes and three pedals are preserved; other controllers do not affect the sound.',
  'MIDI 含缺失松键的音符，请先修复原文件。': 'Some notes have no note-off event. Repair the MIDI first.', '文件中没有可演奏的钢琴音符。': 'No playable piano notes were found.',
  '请使用不超过 20 分钟、20,000 音符的钢琴 MIDI。': 'Use piano MIDI no longer than 20 minutes or 20,000 notes.',
};

export function translate(locale: Locale, text: string): string {
  return locale === 'zh' ? text : ENGLISH[text] ?? text;
}

export function pieceTitle(locale: Locale, title: string): string {
  if (title === 'Kiss the Rain' && locale === 'zh') return '雨的印记';
  if (title === 'Cornfield Chase · 星际穿越' && locale === 'zh') return '原野追逐 · 星际穿越';
  return translate(locale, title);
}
