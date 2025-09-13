// 简化的歌曲类型，只包含播放器需要的字段
export interface SimpleSong {
  hash: string; // 歌曲唯一标识
  name: string; // 歌曲名称
  remark?: string; // 艺术家/备注
  timelen?: number; // 歌曲时长（毫秒）
  cover?: string; // 封面图片URL
  publish_date?: string; // 发布日期
}

// 歌词行接口 - 与你的lrcParser保持一致
export interface LyricLine {
  time: number; // 时间戳（秒）
  text: string; // 歌词文本
}

// API响应类型（保持原有结构以兼容现有代码）
export interface SongsItem {
  mvdata: any[];
  hash: string;
  brief: string;
  audio_id: number;
  mvtype: number;
  size: number;
  publish_date: string;
  name: string;
  mvtrack: number;
  bpm_type: string;
  add_mixsongid: number;
  album_id: string;
  bpm: number;
  mvhash: string;
  extname: string;
  language: string;
  collecttime: number;
  csong: number;
  remark: string;
  level: number;
  tagmap: Record<string, any>;
  media_old_cpy: number;
  relate_goods: any[];
  download: any[];
  rcflag: number;
  feetype: number;
  has_obbligato: number;
  timelen: number;
  sort: number;
  trans_param: Record<string, any>;
  medistype: string;
  user_id: number;
  albuminfo: Record<string, any>;
  bitrate: number;
  audio_group_id: string;
  privilege: number;
  cover: string;
  mixsongid: number;
  fileid: number;
  heat: number;
  singerinfo: any[];
}

// API响应结构
export interface SongListResponse {
  data: {
    begin_idx: number;
    pagesize: number;
    count: number;
    popularization: Record<string, any>;
    userid: number;
    songs: SongsItem[];
  };
}

export interface PlayListResponse {
  data: {
    info: any[];
  };
}

// 播放器使用的歌曲数据结构
export interface SongWithData {
  song: SimpleSong;
  url: string;
  lyrics: LyricLine[];
}
