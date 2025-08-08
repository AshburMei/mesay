"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { SongsItem } from "@/types/songlist-types/songsitem";
import { UrlList } from "@/types/songlist-types/urlsList";
import { parseLRC, findCurrentLine } from "@/utils/lrcParser";
import {
  PlayListResponse,
  SongListResponse,
  LyricLine,
} from "@/types/songlist-types/songsitem";
import "./SongList.scss";

export default function SongList() {
  // 播放器相关状态
  const [currentSong, setCurrentSong] = useState<SongsItem | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Web Audio API 相关引用
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const requestRef = useRef<number | null>(null);

  // 播放状态追踪
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  const isInitializedRef = useRef<boolean>(false);
  const loadingRef = useRef<boolean>(false); // 添加加载状态追踪

  // 歌单和歌词相关状态
  const [songList, setSongList] = useState<any>("");
  const [urlsList, setUrlsList] = useState<UrlList>([]);
  const [textList, setTextList] = useState<LyricLine[][]>([]);
  const [currentSongIndex, setCurrentSongIndex] = useState<number | null>(null);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);

  // 控制相关状态
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoop, setIsLoop] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  // 初始化音频上下文
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();

      // 创建音频节点
      gainNodeRef.current = audioContextRef.current.createGain();
      analyserRef.current = audioContextRef.current.createAnalyser();

      // 设置初始音量
      gainNodeRef.current.gain.value = isMuted ? 0 : volume;

      // 连接节点：source -> gain -> analyser -> destination
      gainNodeRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);

      // 设置analyser节点
      analyserRef.current.fftSize = 256;

      isInitializedRef.current = true;
    }

    // 确保AudioContext处于running状态
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
  }, [volume, isMuted]);

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // 获取封面URL
  const getCoverUrl = (song: SongsItem) => {
    return song?.cover?.replace("{size}", "480") || "/default-cover.jpg";
  };

  // 停止当前播放
  const stopCurrentAudio = useCallback(() => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
        audioSourceRef.current.disconnect();
      } catch (error) {
        // 忽略已经停止的节点错误
      }
      audioSourceRef.current = null;
    }

    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }

    startTimeRef.current = 0;
    pauseTimeRef.current = 0;
  }, []);

  // 时间更新循环
  const updateCurrentTime = useCallback(() => {
    if (
      audioContextRef.current &&
      isPlaying &&
      audioBufferRef.current &&
      audioSourceRef.current
    ) {
      const elapsed =
        audioContextRef.current.currentTime - startTimeRef.current;
      const newCurrentTime = pauseTimeRef.current + elapsed;

      // 检查是否播放完毕
      if (newCurrentTime >= audioBufferRef.current.duration) {
        if (isLoop) {
          // 循环播放，重新开始
          pauseTimeRef.current = 0;
          startTimeRef.current = audioContextRef.current.currentTime;
          setCurrentTime(0);
        } else {
          // 播放完毕，停止播放
          setIsPlaying(false);
          setCurrentTime(0);
          pauseTimeRef.current = 0;
          stopCurrentAudio();

          // 播放下一首
          if (songList?.songs?.length && currentSongIndex !== null) {
            const nextIndex = (currentSongIndex + 1) % songList.songs.length;
            const nextSong = songList.songs[nextIndex];

            setCurrentSong(nextSong);
            setCurrentSongIndex(nextIndex);

            setTimeout(() => {
              if (urlsList[nextIndex]) {
                // 这里直接调用加载函数，避免依赖问题
                const loadNext = async () => {
                  try {
                    if (!audioContextRef.current) return;

                    const response = await fetch(urlsList[nextIndex]);
                    if (!response.ok) return;

                    const arrayBuffer = await response.arrayBuffer();
                    const audioBuffer =
                      await audioContextRef.current.decodeAudioData(
                        arrayBuffer
                      );
                    audioBufferRef.current = audioBuffer;

                    const source = audioContextRef.current.createBufferSource();
                    source.buffer = audioBuffer;
                    source.loop = isLoop;
                    source.playbackRate.value = playbackRate;
                    source.connect(gainNodeRef.current!);
                    audioSourceRef.current = source;

                    pauseTimeRef.current = 0;
                    startTimeRef.current = audioContextRef.current.currentTime;
                    source.start(0, 0);
                    setDuration(audioBuffer.duration);
                    setCurrentTime(0);
                    setIsPlaying(true);

                    source.onended = () => {
                      if (
                        audioSourceRef.current === source &&
                        isLoop &&
                        isPlaying
                      ) {
                        setTimeout(() => {
                          if (audioSourceRef.current === source) {
                            loadNext();
                          }
                        }, 10);
                      }
                    };
                  } catch (error) {
                    console.error("Error loading next audio:", error);
                  }
                };
                loadNext();
              }
            }, 10);
          }
          return;
        }
      } else {
        setCurrentTime(newCurrentTime);
      }

      requestRef.current = requestAnimationFrame(updateCurrentTime);
    }
  }, [
    isPlaying,
    isLoop,
    stopCurrentAudio,
    songList,
    currentSongIndex,
    urlsList,
    playbackRate,
  ]);

  // 加载并播放音频
  const loadAndPlayAudio = useCallback(
    async (url: string, seekTime: number = 0) => {
      // 防止重复加载
      if (loadingRef.current) {
        return;
      }

      loadingRef.current = true;

      try {
        // 初始化音频上下文
        if (!isInitializedRef.current) {
          initAudioContext();
        }

        if (!audioContextRef.current) {
          loadingRef.current = false;
          return;
        }

        // 停止当前播放
        stopCurrentAudio();

        // 获取音频数据
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer =
          await audioContextRef.current.decodeAudioData(arrayBuffer);
        audioBufferRef.current = audioBuffer;

        // 创建新的音频源节点
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.loop = isLoop;
        source.playbackRate.value = playbackRate;

        // 连接到已存在的音频图
        source.connect(gainNodeRef.current!);
        audioSourceRef.current = source;

        // 设置播放时间
        pauseTimeRef.current = seekTime;
        startTimeRef.current = audioContextRef.current.currentTime;

        // 从指定时间开始播放
        source.start(0, seekTime);

        // 设置持续时间
        setDuration(audioBuffer.duration);
        setCurrentTime(seekTime);
        setIsPlaying(true);

        // 开始时间更新循环
        if (requestRef.current) {
          cancelAnimationFrame(requestRef.current);
        }

        const startUpdateLoop = () => {
          if (
            audioContextRef.current &&
            audioSourceRef.current === source &&
            isPlaying
          ) {
            const elapsed =
              audioContextRef.current.currentTime - startTimeRef.current;
            const newCurrentTime = pauseTimeRef.current + elapsed;

            if (newCurrentTime >= audioBuffer.duration) {
              if (isLoop) {
                pauseTimeRef.current = 0;
                startTimeRef.current = audioContextRef.current.currentTime;
                setCurrentTime(0);
                requestRef.current = requestAnimationFrame(startUpdateLoop);
              } else {
                setIsPlaying(false);
                setCurrentTime(0);
                pauseTimeRef.current = 0;
                if (audioSourceRef.current === source) {
                  // 播放下一首
                  setTimeout(() => {
                    if (songList?.songs?.length && currentSongIndex !== null) {
                      const nextIndex =
                        (currentSongIndex + 1) % songList.songs.length;
                      const nextSong = songList.songs[nextIndex];

                      setCurrentSong(nextSong);
                      setCurrentSongIndex(nextIndex);

                      if (urlsList[nextIndex]) {
                        loadAndPlayAudio(urlsList[nextIndex], 0);
                      }
                    }
                  }, 50);
                }
              }
            } else {
              setCurrentTime(newCurrentTime);
              if (audioSourceRef.current === source) {
                requestRef.current = requestAnimationFrame(startUpdateLoop);
              }
            }
          }
        };

        // 延迟启动更新循环，确保状态已设置
        setTimeout(() => {
          if (audioSourceRef.current === source) {
            requestRef.current = requestAnimationFrame(startUpdateLoop);
          }
        }, 10);

        // 播放结束事件处理
        source.onended = () => {
          if (audioSourceRef.current === source) {
            if (isLoop) {
              setTimeout(() => {
                if (audioSourceRef.current === source) {
                  loadAndPlayAudio(url, 0);
                }
              }, 10);
            }
          }
        };
      } catch (error) {
        console.error("Error loading audio:", error);
        setIsPlaying(false);
      } finally {
        loadingRef.current = false;
      }
    },
    [
      isLoop,
      playbackRate,
      stopCurrentAudio,
      initAudioContext,
      songList,
      currentSongIndex,
      urlsList,
      isPlaying,
    ]
  );

  // 暂停音频
  const pauseAudio = useCallback(() => {
    if (isPlaying && audioContextRef.current) {
      setIsPlaying(false);

      // 记录暂停时的时间
      const elapsed =
        audioContextRef.current.currentTime - startTimeRef.current;
      pauseTimeRef.current += elapsed;

      // 停止当前源节点
      stopCurrentAudio();
    }
  }, [isPlaying, stopCurrentAudio]);

  // 恢复播放 - 先声明一个空的实现，稍后更新
  const resumeAudio = useCallback(async () => {
    // 实现将在 loadAndPlayAudio 声明后更新
  }, []);

  // 播放/暂停控制
  const togglePlay = useCallback(
    async (song: SongsItem, index: number) => {
      if (!urlsList[index] || loadingRef.current) return;

      if (currentSong?.hash === song.hash) {
        // 同一首歌
        if (isPlaying) {
          pauseAudio();
        } else {
          // 直接调用 loadAndPlayAudio 而不是 resumeAudio
          if (
            audioBufferRef.current &&
            currentSongIndex !== null &&
            urlsList[currentSongIndex]
          ) {
            await loadAndPlayAudio(
              urlsList[currentSongIndex],
              pauseTimeRef.current
            );
          }
        }
      } else {
        // 新歌曲，先停止当前播放
        stopCurrentAudio();
        setIsPlaying(false);

        setCurrentSong(song);
        setCurrentSongIndex(index);
        setCurrentTime(0);
        pauseTimeRef.current = 0;

        // 直接调用 loadAndPlayAudio，不延迟
        await loadAndPlayAudio(urlsList[index], 0);
      }
    },
    [urlsList, currentSong, isPlaying, pauseAudio, stopCurrentAudio]
  );

  // 下一首
  const handlePlayNext = useCallback(async () => {
    if (
      !songList?.songs?.length ||
      currentSongIndex === null ||
      loadingRef.current
    )
      return;

    // 先停止当前播放
    stopCurrentAudio();
    setIsPlaying(false);

    let nextIndex = (currentSongIndex + 1) % songList.songs.length;
    const nextSong = songList.songs[nextIndex];

    setCurrentSong(nextSong);
    setCurrentSongIndex(nextIndex);
    setCurrentTime(0);
    pauseTimeRef.current = 0;

    // 直接调用，不延迟
    if (urlsList[nextIndex]) {
      await loadAndPlayAudio(urlsList[nextIndex], 0);
    }
  }, [
    songList,
    currentSongIndex,
    urlsList,
    stopCurrentAudio,
    loadAndPlayAudio,
  ]);

  // 上一首
  const handlePlayPrev = useCallback(async () => {
    if (
      !songList?.songs?.length ||
      currentSongIndex === null ||
      loadingRef.current
    )
      return;

    // 先停止当前播放
    stopCurrentAudio();
    setIsPlaying(false);

    let prevIndex =
      (currentSongIndex - 1 + songList.songs.length) % songList.songs.length;
    const prevSong = songList.songs[prevIndex];

    setCurrentSong(prevSong);
    setCurrentSongIndex(prevIndex);
    setCurrentTime(0);
    pauseTimeRef.current = 0;

    // 直接调用，不延迟
    if (urlsList[prevIndex]) {
      await loadAndPlayAudio(urlsList[prevIndex], 0);
    }
  }, [
    songList,
    currentSongIndex,
    urlsList,
    stopCurrentAudio,
    loadAndPlayAudio,
  ]);

  // 切换循环
  const toggleLoop = useCallback(() => {
    const newLoop = !isLoop;
    setIsLoop(newLoop);
    if (audioSourceRef.current) {
      audioSourceRef.current.loop = newLoop;
    }
  }, [isLoop]);

  // 改变音量
  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(e.target.value);
      setVolume(newVolume);
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.setValueAtTime(
          newVolume,
          audioContextRef.current!.currentTime
        );
      }
      setIsMuted(newVolume === 0);
    },
    []
  );

  // 切换静音
  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (gainNodeRef.current && audioContextRef.current) {
      const targetVolume = newMuted ? 0 : volume;
      gainNodeRef.current.gain.setValueAtTime(
        targetVolume,
        audioContextRef.current.currentTime
      );
    }
  }, [isMuted, volume]);

  // 改变播放速度
  const changePlaybackRate = useCallback(() => {
    const rates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    const newRate = rates[nextIndex];

    setPlaybackRate(newRate);
    if (audioSourceRef.current && audioContextRef.current) {
      audioSourceRef.current.playbackRate.setValueAtTime(
        newRate,
        audioContextRef.current.currentTime
      );
    }
  }, [playbackRate]);

  // 进度条点击
  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (
        !audioBufferRef.current ||
        !duration ||
        isDragging ||
        loadingRef.current
      )
        return;

      const progressBar = e.currentTarget;
      const rect = progressBar.getBoundingClientRect();
      const clickPosition = Math.max(
        0,
        Math.min(e.clientX - rect.left, rect.width)
      );
      const seekTime = (clickPosition / rect.width) * duration;

      // 限制跳转时间在有效范围内
      const clampedSeekTime = Math.max(0, Math.min(seekTime, duration - 0.1));

      setCurrentTime(clampedSeekTime);
      pauseTimeRef.current = clampedSeekTime;

      if (currentSongIndex !== null && urlsList[currentSongIndex]) {
        if (isPlaying || audioSourceRef.current) {
          // 重新加载当前歌曲并跳转到指定时间
          loadAndPlayAudio(urlsList[currentSongIndex], clampedSeekTime);
        }
      }
    },
    [
      duration,
      currentSongIndex,
      urlsList,
      isPlaying,
      isDragging,
      loadAndPlayAudio,
    ]
  );

  // 获取歌单数据
  useEffect(() => {
    const fetchPlaylist = async () => {
      try {
        // 获取用户歌单
        const playListRes = await fetch(`http://localhost:3000/user/playlist`, {
          credentials: "include",
        });
        const playListData: PlayListResponse = await playListRes.json();

        // 获取歌单中的歌曲
        const playlistId = playListData.data.info[1]?.global_collection_id;
        if (!playlistId) return;

        const songsRes = await fetch(
          `http://localhost:3000/playlist/track/all?id=${playlistId}`,
          { credentials: "include" }
        );
        const songsData: SongListResponse = await songsRes.json();

        if (!songsData.data?.songs) return;

        // 获取歌曲URL和歌词
        const songsWithData = await Promise.all(
          songsData.data.songs.map(async (song) => {
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

              let lyrics = null;
              const candidate = lyricData.candidates?.[0];
              if (candidate) {
                const lyricDetailRes = await fetch(
                  `http://localhost:3000/lyric?id=${candidate.id}&accesskey=${candidate.accesskey}&fmt=lrc&decode=true`,
                  { credentials: "include" }
                );
                const lyricDetail = await lyricDetailRes.json();
                lyrics = lyricDetail.decodeContent
                  ? parseLRC(lyricDetail.decodeContent)
                  : [];
              }

              return {
                song,
                url: urlData.url?.[0],
                lyrics,
              };
            } catch (error) {
              console.error("Error fetching song data:", error);
              return null;
            }
          })
        );

        // 过滤无效歌曲
        const validSongs = songsWithData.filter(
          (item) => item !== null && item.url
        ) as {
          song: SongsItem;
          url: string;
          lyrics: LyricLine[];
        }[];

        // 更新状态
        setSongList({
          playlist: playListData.data.info[1],
          songs: validSongs.map((item) => item.song),
        });
        setUrlsList(validSongs.map((item) => item.url));
        setTextList(validSongs.map((item) => item.lyrics));
      } catch (error) {
        console.error("Error fetching playlist:", error);
      }
    };

    fetchPlaylist();
  }, []);

  // 歌词同步
  useEffect(() => {
    if (!textList[currentSongIndex ?? 0]?.length) {
      setCurrentLineIndex(-1);
      return;
    }

    const lyrics = textList[currentSongIndex ?? 0];
    const newIndex = findCurrentLine(currentTime, lyrics, currentLineIndex);
    if (newIndex !== currentLineIndex) setCurrentLineIndex(newIndex);
  }, [currentTime, textList, currentSongIndex, currentLineIndex]);

  // 歌词滚动
  useEffect(() => {
    if (!lyricsContainerRef.current || currentLineIndex === -1) return;

    const container = lyricsContainerRef.current;
    const activeLine = container.children[currentLineIndex] as HTMLElement;
    if (!activeLine) return;

    container.scrollTo({
      top: activeLine.offsetTop - container.clientHeight / 2,
      behavior: "smooth",
    });
  }, [currentLineIndex]);

  // 点击歌词跳转
  const handleLyricClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const time = Number(e.currentTarget.dataset.time);
      if (
        !isNaN(time) &&
        currentSongIndex !== null &&
        urlsList[currentSongIndex] &&
        !loadingRef.current
      ) {
        setCurrentTime(time);
        pauseTimeRef.current = time;
        if (isPlaying) {
          loadAndPlayAudio(urlsList[currentSongIndex], time);
        }
      }
    },
    [currentSongIndex, urlsList, isPlaying, loadAndPlayAudio]
  );

  // 清理资源
  useEffect(() => {
    return () => {
      stopCurrentAudio();
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
      }
    };
  }, [stopCurrentAudio]);

  return (
    <div className="song-player-container">
      {/* 歌曲列表 */}
      <div className="song-list">
        <div className="list-title">
          {songList?.playlist?.name || "加载中..."}
        </div>
        <div className="song-list-container">
          {songList?.songs?.map((item: SongsItem, index: number) => {
            const isCurrent = currentSong?.hash === item.hash;

            return (
              <div
                key={item.hash}
                className={`song-item ${isCurrent ? "active" : ""}`}
                onClick={() => togglePlay(item, index)}
              >
                <img
                  src={getCoverUrl(item)}
                  alt={item.albuminfo?.name || "未知专辑"}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/default-cover.jpg";
                  }}
                />
                <div className="song-info">
                  <div className="song-name">{item.name}</div>
                </div>
                {isCurrent && isPlaying && (
                  <span className="playing-icon">⏸</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 歌词展示 */}
      <div className="song-display-container">
        {currentSong && (
          <div className="current-song-display">
            <img
              src={getCoverUrl(currentSong)}
              alt={currentSong.name}
              className="display-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/default-cover.jpg";
              }}
            />
            <div className="display-info">
              <div ref={lyricsContainerRef} className="lyrics-container">
                {textList[currentSongIndex ?? 0]?.length > 0 ? (
                  textList[currentSongIndex ?? 0].map(
                    (line: LyricLine, index: number) => (
                      <div
                        key={`${line.time}-${index}`}
                        className={`lyric-line ${index === currentLineIndex ? "active" : ""}`}
                        data-time={line.time}
                        onClick={handleLyricClick}
                      >
                        {line.text || " "}
                      </div>
                    )
                  )
                ) : (
                  <div className="no-lyrics">暂无歌词</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 播放器控制面板 */}
      {currentSong && (
        <div className="player-controls">
          <div className="control-container">
            <div className="info-container">
              <img
                src={getCoverUrl(currentSong)}
                alt={currentSong.name}
                className="control-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/default-cover.jpg";
                }}
              />
              <div className="control-info">
                <div className="control-title">{currentSong.name}</div>
              </div>
            </div>
            <div className="volume-control">
              <button className="volume-button" onClick={toggleMute}>
                {isMuted ? "M" : volume > 0.5 ? "H" : "L"}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="volume-slider"
              />
            </div>
            <div className="all-container">
              <div className="button-container">
                <button
                  className={`loop-button ${isLoop ? "active" : ""}`}
                  onClick={toggleLoop}
                  title="单曲循环"
                >
                  🔁
                </button>
                <button className="prev-button" onClick={handlePlayPrev}>
                  {"<"}
                </button>
                <button
                  className="play-button"
                  onClick={() => {
                    if (currentSong && currentSongIndex !== null) {
                      togglePlay(currentSong, currentSongIndex);
                    }
                  }}
                >
                  {isPlaying ? "⏸" : "▶"}
                </button>
                <button className="next-button" onClick={handlePlayNext}>
                  {">"}
                </button>
                <button
                  className="speed-button"
                  onClick={changePlaybackRate}
                  title="切换播放速度"
                >
                  {playbackRate.toFixed(2)}x
                </button>
              </div>

              <div className="show-container">
                <div className="current-time">{formatTime(currentTime)}</div>
                <div
                  className="time-bar"
                  onClick={handleProgressClick}
                  onMouseDown={() => setIsDragging(true)}
                  onMouseMove={isDragging ? handleProgressClick : undefined}
                  onMouseUp={() => setIsDragging(false)}
                  onMouseLeave={() => setIsDragging(false)}
                >
                  <div
                    className="progress"
                    style={{
                      width: `${duration ? (currentTime / duration) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="all-time">{formatTime(duration)}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
