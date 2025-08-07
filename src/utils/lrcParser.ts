// utils/lrcParser.ts

export interface LyricLine {
  time: number; // 时间点（秒）
  text: string; // 歌词文本
}

/**
 * 简化版LRC解析器，仅解析歌词部分
 * 支持：
 * 1. 标准时间标签 [mm:ss.xx]
 * 2. 双语歌词（用 // 分隔）
 * 3. 多种时间格式兼容
 */
export function parseLRC(lrcText: string): LyricLine[] {
  const lines = lrcText.split(/\r?\n/);
  const lyrics: LyricLine[] = [];

  // 匹配时间标签 [mm:ss.xx] 或 [mm:ss:xx] 或 [mm:ss]
  const timeRegex = /\[(\d+):(\d+)([:.](\d+))?\]/g;

  for (const line of lines) {
    if (!line.trim()) continue;

    // 处理双语歌词（用 // 分隔）
    const [lyricPart] = line.split("//").map((p) => p.trim());

    // 处理歌词行
    const times: number[] = [];
    let text = lyricPart;
    let match;

    while ((match = timeRegex.exec(lyricPart)) !== null) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const milliseconds = match[4]
        ? parseInt(match[4].padEnd(3, "0")) / 1000
        : 0;

      const time = minutes * 60 + seconds + milliseconds;
      times.push(time);
      text = text.replace(match[0], "");
    }

    if (times.length > 0 && text.trim()) {
      times.forEach((time) => {
        lyrics.push({
          time,
          text: text.trim(),
        });
      });
    }
  }

  // 按时间排序
  lyrics.sort((a, b) => a.time - b.time);
  return lyrics;
}

/**
 * 辅助函数：查找当前时间对应的歌词行
 * 使用二分查找提高效率
 */
export function findCurrentLine(
  currentTime: number,
  lyrics: LyricLine[],
  startIndex: number = 0
): number {
  // 新增边界检查
  if (!lyrics?.length || !Number.isFinite(currentTime)) return -1;

  let left = Math.max(0, startIndex); // 确保不越界
  let right = lyrics.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const currentItem = lyrics[mid];

    // 新增空值检查
    if (!currentItem) break;

    if (currentItem.time <= currentTime) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result;
}
