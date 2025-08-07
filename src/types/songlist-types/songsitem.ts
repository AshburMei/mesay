export interface SongsItem {
  hash: string;
  name: string;
  mvhash: string;
  albuminfo: {
    name: string;
    id: number;
  };
  cover?: string; // 添加可选属性
  singerinfo: Array<{
    name: string;
    avatar: string;
  }>;
}

export interface SongsResponse {
  count: number;
  songs: SongsItem[];
}

export interface PlayListResponse {
  data: {
    info: Array<{
      create_time: number;
      global_collection_id: string;
      name: string;
      update_time: string;
    }>;
    userid: number;
  };
}

export interface SongListResponse {
  data: {
    count: number;
    songs: Array<{
      albuminfo: {
        id: number;
        name: string;
      };
      cover: string;
      hash: string;
      mvhash: string;
      name: string;
      publish_date: string;
      singerinfo: Array<{
        avatar: string;
        name: string;
        id: number;
      }>;
    }>;
  };
}

export interface ProcessedPlaylist {
  playlist: {
    name: string;
    global_collection_id: string;
  };
  songs: Array<SongsItem & { cover: string }>;
}

export interface LyricLine {
  time: number;
  text: string;
}
