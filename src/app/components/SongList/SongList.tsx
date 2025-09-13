"use client";
import React, { useEffect, useState } from "react";
import {
  SimpleSong,
  SongListResponse,
  PlayListResponse,
  LyricLine,
} from "@/types/songlist-types/songsitem";
import { UrlList } from "@/types/songlist-types/urlsList";
import { parseLRC } from "@/utils/lrcParser";
import useAudioPlayer from "@/app/hooks/useAudioPlayer";
import SongListPanel from "./SongListPanel/SongListPanel";
import SongLyrics from "../SongLyrics/SongLyrics";
import PlayerControls from "./PlayControls/PlayerControls";
import "./SongList.scss";

interface LoadingState {
  isLoading: boolean;
  message: string;
  progress?: number;
}

interface SongWithData {
  song: SimpleSong;
  url: string;
  lyrics: LyricLine[];
  cover: string; // 新增封面字段
}

export default function SongList() {
  const [songList, setSongList] = useState<{
    playlist: any;
    songs: SimpleSong[];
  } | null>(null);
  const [urlsList, setUrlsList] = useState<UrlList>([]);
  const [textList, setTextList] = useState<LyricLine[][]>([]);
  const [coversList, setCoversList] = useState<string[]>([]); // 新增封面列表状态
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    message: "",
  });
  const [error, setError] = useState<string | null>(null);

  // 播放逻辑
  const player = useAudioPlayer({ songList, urlsList, textList });

  // 处理封面URL的函数
  const processCoverUrl = (unionCover: string): string => {
    if (!unionCover) return "";
    return unionCover.replace(/{size}/g, "480");
  };

  // 网络请求逻辑
  useEffect(() => {
    const fetchPlaylist = async () => {
      try {
        setLoadingState({ isLoading: true, message: "获取播放列表..." });
        setError(null);

        // 获取播放列表
        const playListRes = await fetch(`http://localhost:3000/user/playlist`, {
          credentials: "include",
        });

        if (!playListRes.ok) {
          throw new Error(`HTTP error! status: ${playListRes.status}`);
        }

        const playListData: PlayListResponse = await playListRes.json();
        const playlistId = playListData.data.info[1]?.global_collection_id;

        if (!playlistId) {
          throw new Error("未找到有效的播放列表ID");
        }

        setLoadingState({ isLoading: true, message: "获取歌曲列表..." });

        // 获取歌曲列表
        const songsRes = await fetch(
          `http://localhost:3000/playlist/track/all?id=${playlistId}`,
          {
            credentials: "include",
          }
        );

        if (!songsRes.ok) {
          throw new Error(`HTTP error! status: ${songsRes.status}`);
        }

        const songsData: SongListResponse = await songsRes.json();

        if (!songsData.data?.songs || songsData.data.songs.length === 0) {
          throw new Error("播放列表中没有歌曲");
        }

        // 使用 any 类型绕过复杂的类型推断问题
        const rawSongs = songsData.data.songs as any[];
        const totalSongs = rawSongs.length;

        setLoadingState({
          isLoading: true,
          message: "加载歌曲详情...",
          progress: 0,
        });

        // 并行获取歌曲URL和歌词
        const songsWithData = await Promise.allSettled(
          rawSongs.map(
            async (song: any, index: number): Promise<SongWithData | null> => {
              try {
                const [urlRes, lyricRes] = await Promise.all([
                  fetch(
                    `http://localhost:3000/song/url/?hash=${song.hash}&quality=flac`,
                    { credentials: "include" }
                  ),
                  fetch(
                    `http://localhost:3000/search/lyric?hash=${song.hash}`,
                    {
                      credentials: "include",
                    }
                  ),
                ]);

                const [urlData, lyricData] = await Promise.all([
                  urlRes.ok ? urlRes.json() : { url: [] },
                  lyricRes.ok ? lyricRes.json() : { candidates: [] },
                ]);

                // 检查URL是否有效
                if (!urlData.url?.[0]) {
                  console.warn(`歌曲URL获取失败 - ${song.name}`);
                  return null;
                }

                // 提取并处理封面URL
                let coverUrl = "";
                if (urlData.trans_param?.union_cover) {
                  coverUrl = processCoverUrl(urlData.trans_param.union_cover);
                } else {
                  console.warn(
                    `歌曲封面缺失 - ${song.name}:`,
                    urlData.trans_param
                  );
                }

                let lyrics: LyricLine[] = [];
                const candidate = lyricData.candidates?.[0];
                if (candidate) {
                  try {
                    const lyricDetailRes = await fetch(
                      `http://localhost:3000/lyric?id=${candidate.id}&accesskey=${candidate.accesskey}&fmt=lrc&decode=true`,
                      { credentials: "include" }
                    );
                    if (lyricDetailRes.ok) {
                      const lyricDetail = await lyricDetailRes.json();
                      lyrics = lyricDetail.decodeContent
                        ? parseLRC(lyricDetail.decodeContent)
                        : [];
                    }
                  } catch (lyricError) {
                    console.warn(`歌词获取失败 - ${song.name}:`, lyricError);
                  }
                }

                // 更新进度
                const progress = Math.round(((index + 1) / totalSongs) * 100);
                setLoadingState((prev) => ({
                  ...prev,
                  progress,
                  message: `加载歌曲详情... (${index + 1}/${totalSongs})`,
                }));

                // 构造SimpleSong对象
                const simpleSong: SimpleSong = {
                  hash: song.hash || "",
                  name: song.name || "未知歌曲",
                  remark: song.remark || "",
                  timelen: song.timelen || 0,
                  cover: song.cover || "",
                  publish_date: song.publish_date || "",
                };

                return {
                  song: simpleSong,
                  url: urlData.url[0],
                  lyrics,
                  cover: coverUrl, // 添加封面数据
                };
              } catch (e) {
                console.error(`歌曲加载失败 - ${song.name}:`, e);
                return null;
              }
            }
          )
        );

        // 处理结果，只保留成功加载的歌曲
        const validSongs: SongWithData[] = [];

        songsWithData.forEach((result) => {
          if (result.status === "fulfilled" && result.value !== null) {
            validSongs.push(result.value);
          }
        });

        if (validSongs.length === 0) {
          throw new Error("没有可播放的歌曲");
        }

        // 设置状态
        setSongList({
          playlist: playListData.data.info[1],
          songs: validSongs.map((item) => item.song),
        });
        setUrlsList(validSongs.map((item) => item.url));
        setTextList(validSongs.map((item) => item.lyrics));
        setCoversList(validSongs.map((item) => item.cover)); // 设置封面列表

        setLoadingState({ isLoading: false, message: "" });

        // 显示加载统计
        if (validSongs.length < totalSongs) {
          console.warn(`成功加载 ${validSongs.length}/${totalSongs} 首歌曲`);
        }
      } catch (err) {
        console.error("播放列表加载错误:", err);
        setError(
          err instanceof Error ? err.message : "加载播放列表时发生未知错误"
        );
        setLoadingState({ isLoading: false, message: "" });
      }
    };

    fetchPlaylist();
  }, []);

  // 渲染加载状态
  if (loadingState.isLoading) {
    return (
      <div className="song-player-container loading">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p className="loading-message">{loadingState.message}</p>
          {loadingState.progress !== undefined && (
            <div className="loading-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${loadingState.progress}%` }}
                ></div>
              </div>
              <span className="progress-text">{loadingState.progress}%</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 渲染错误状态
  if (error) {
    return (
      <div className="song-player-container error">
        <div className="error-content">
          <h3>加载失败</h3>
          <p>{error}</p>
          <button
            className="retry-button"
            onClick={() => window.location.reload()}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // 渲染空状态
  if (!songList || songList.songs.length === 0) {
    return (
      <div className="song-player-container empty">
        <div className="empty-content">
          <h3>暂无歌曲</h3>
          <p>播放列表为空，请添加一些歌曲</p>
        </div>
      </div>
    );
  }
  //测试
  // 渲染正常状态
  return (
    <div className="song-player-container">
      <SongListPanel
        songList={songList.songs}
        coversList={coversList} // 传递封面列表
        currentSong={player.currentSong}
        isPlaying={player.isPlaying}
        onSelect={(index) => player.playSongAtIndex(index)}
      />

      <SongLyrics
        lyrics={textList[player.currentSongIndex || 0] || []}
        currentLineIndex={player.currentLineIndex}
        onLyricClick={player.handleLyricClick}
      />

      <PlayerControls
        isPlaying={player.isPlaying}
        currentTime={player.currentTime}
        duration={player.duration}
        onPlayPause={() => player.togglePlay()}
        onNext={player.playNext}
        onPrev={player.playPrev}
        onSeek={player.seek}
        onVolumeChange={player.onVolumeChange}
        onPlaybackRateChange={player.onPlaybackRateChange}
        volume={player.volume}
        playbackRate={player.playbackRate}
        isLooping={player.isLooping}
        onLoopToggle={player.handleLoopModeChange}
      />
    </div>
  );
}
