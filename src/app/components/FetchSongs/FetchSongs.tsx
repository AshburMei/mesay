"use client";

import React, { useState, useEffect } from "react";
import { SongsItem } from "@/types/songlist-types/songsitem";
import { UrlList } from "@/types/songlist-types/urlsList";
import { parseLRC } from "@/utils/lrcParser";
import {
  PlayListResponse,
  SongListResponse,
  LyricLine,
} from "@/types/songlist-types/songsitem";

// 定义更严格的类型
interface FetchedSongData {
  song: SongsItem;
  url: string;
  lyrics: LyricLine[] | null;
}

interface SongDataFetcherProps {
  onDataLoaded: (data: {
    playList: PlayListResponse | null;
    songList: Array<{
      playlist: {
        name: string;
        global_collection_id: string;
      };
      songs: SongsItem[];
    }>;
    songsData: FetchedSongData[];
  }) => void;
  onLoadingChange: (loading: boolean) => void;
  onError: (error: string | null) => void;
}

export const SongDataFetcher: React.FC<SongDataFetcherProps> = ({
  onDataLoaded,
  onLoadingChange,
  onError,
}) => {
  useEffect(() => {
    const fetchData = async () => {
      try {
        onLoadingChange(true);
        onError(null);

        // 1. 获取用户歌单
        const playListRes = await fetch(`http://localhost:3000/user/playlist`, {
          credentials: "include",
        });
        const playListData: PlayListResponse = await playListRes.json();

        // 2. 获取每个歌单的歌曲
        const playListWithSongs = await Promise.all(
          playListData.data.info.map(async (item) => {
            try {
              const res = await fetch(
                `http://localhost:3000/playlist/track/all?id=${item.global_collection_id}`,
                { credentials: "include" }
              );
              const listSongData: SongListResponse = await res.json();
              return {
                playlist: {
                  name: item.name,
                  global_collection_id: item.global_collection_id,
                },
                songs: listSongData.data?.songs || [],
              };
            } catch (error) {
              console.error(`获取歌单歌曲失败: ${item.name}`);
              return {
                playlist: item,
                songs: [] as SongsItem[],
              };
            }
          })
        );

        // 3. 获取"我喜欢"歌单的详细数据(假设是第二个歌单)
        const favoriteSongs = playListWithSongs[1]?.songs || [];
        const songsDetailedData = await Promise.all(
          favoriteSongs.map(async (song) => {
            try {
              const [urlRes, lyricRes] = await Promise.all([
                fetch(
                  `http://localhost:3000/song/url/?hash=${song.hash}&quality=flac`,
                  {
                    credentials: "include",
                  }
                ),
                fetch(`http://localhost:3000/search/lyric?hash=${song.hash}`, {
                  credentials: "include",
                }),
              ]);

              const [urlData, lyricData] = await Promise.all([
                urlRes.json(),
                lyricRes.json(),
              ]);

              // 处理歌词数据
              let lyrics = null;
              const candidate = lyricData.candidates?.[0];
              if (candidate) {
                try {
                  const textDataRes = await fetch(
                    `http://localhost:3000/lyric?id=${candidate.id}&accesskey=${candidate.accesskey}&fmt=lrc&decode=true`,
                    { credentials: "include" }
                  );
                  const textData = await textDataRes.json();
                  lyrics = parseLRC(textData.decodeContent);
                } catch (error) {
                  console.error("歌词解析失败:", error);
                }
              }

              return {
                song,
                url: urlData.url?.[0] || "",
                lyrics,
              };
            } catch (err) {
              console.error("获取歌曲详情失败:", err);
              return null;
            }
          })
        );

        // 过滤无效数据
        const validSongsData = songsDetailedData.filter(
          (item): item is FetchedSongData => item !== null && item.url
        );

        // 更新父组件数据
        onDataLoaded({
          playList: playListData,
          songList: playListWithSongs,
          songsData: validSongsData,
        });
      } catch (error) {
        console.error("获取数据失败:", error);
        onError("获取音乐数据失败，请刷新重试");
      } finally {
        onLoadingChange(false);
      }
    };

    fetchData();
  }, [onDataLoaded, onLoadingChange, onError]);

  return null; // 此组件不渲染任何UI
};
