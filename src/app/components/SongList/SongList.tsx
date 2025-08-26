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

  // Web Audio API 相关ref，ref来管理web audio的状态，是因为useRef能够提供稳定的引用而不会触发重新渲染，useState的异步更新和重新渲染特性会导致音频播放不流畅
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
  const playRequestIdRef = useRef<number>(0); // 播放请求ID，用于防抖
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null); // 点击防抖定时器

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

  // 初始化音频上下文，当前只进行gain->analyser->destination的连接，先不连接source是因为，source节点在每次播放前都是重新创建的，如果初始时创建，但连接还包留着会导致内存泄漏
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)(); //保证兼容性，确保不同浏览器都能支持web audio api
      // 创建音频节点
      gainNodeRef.current = audioContextRef.current.createGain();
      //创建分析节点
      analyserRef.current = audioContextRef.current.createAnalyser();
      // 设置初始音量
      gainNodeRef.current.gain.value = isMuted ? 0 : volume;

      // 连接节点：source -> gain -> analyser -> destination
      gainNodeRef.current.connect(analyserRef.current);
      //这里的destination的扬声器
      analyserRef.current.connect(audioContextRef.current.destination);

      // 设置analyser节点，fftSize是傅立叶变化大小，一般是256
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

  // 播放指定歌曲的核心逻辑（带防抖）
  const playSongAtIndex = useCallback(
    async (index: number, seekTime: number = 0) => {
      if (
        !songList?.songs?.length ||
        index < 0 ||
        index >= songList.songs.length ||
        !urlsList[index]
      ) {
        return;
      }

      // 生成新的请求ID，用于防抖
      const currentRequestId = ++playRequestIdRef.current;
      const song = songList.songs[index];
      // 先停止当前播放
      stopCurrentAudio();
      setIsPlaying(false);
      setCurrentSong(song);
      setCurrentSongIndex(index);
      setCurrentTime(seekTime);
      pauseTimeRef.current = seekTime;
      // 加载并播放音频
      try {
        // 检查是否还是最新的请求
        if (currentRequestId !== playRequestIdRef.current) {
          return; // 如果不是最新请求，直接返回
        }

        // 初始化音频上下文，音频上下文只需要创建一次
        if (!isInitializedRef.current) {
          initAudioContext();
        }
        if (!audioContextRef.current) return;
        // 再次检查是否还是最新的请求
        if (currentRequestId !== playRequestIdRef.current) {
          return;
        }

        // 获取音频数据
        const response = await fetch(urlsList[index]);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        // 检查是否还是最新的请求
        if (currentRequestId !== playRequestIdRef.current) {
          return;
        }

        //将获取到的音频进行二进制转码arrayBuffer()，之后再进行转码为PCM格式
        const arrayBuffer = await response.arrayBuffer();
        // 检查是否还是最新的请求
        if (currentRequestId !== playRequestIdRef.current) {
          return;
        }
        const audioBuffer =
          await audioContextRef.current.decodeAudioData(arrayBuffer);
        // 最后一次检查是否还是最新的请求
        if (currentRequestId !== playRequestIdRef.current) {
          return;
        }
        audioBufferRef.current = audioBuffer;

        // 创建新的音频源节点
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.loop = isLoop;
        source.playbackRate.value = playbackRate;
        // 连接到已存在的音频图，保证创建源头是可更换的
        source.connect(gainNodeRef.current!);
        audioSourceRef.current = source;
        // 设置播放时间
        pauseTimeRef.current = seekTime;
        startTimeRef.current = audioContextRef.current.currentTime;
        // 从指定时间开始播放
        source.start(0, seekTime); //第一个参数是多长时间后开始，第二个是从哪一个时间开始，第三个是播放多长时间
        // 设置持续时间，用于播放进度条的设置
        setDuration(audioBuffer.duration);
        setCurrentTime(seekTime);
        setIsPlaying(true);

        // 播放结束事件处理
        source.onended = () => {
          if (
            audioSourceRef.current === source &&
            !isLoop &&
            currentRequestId === playRequestIdRef.current
          ) {
            // 播放下一首
            const nextIndex = (index + 1) % songList.songs.length;
            setTimeout(() => playSongAtIndex(nextIndex, 0), 50);
          }
        };
      } catch (error) {
        console.error("Error loading audio:", error);
        // 只有在当前请求ID匹配时才设置播放状态为false
        if (currentRequestId === playRequestIdRef.current) {
          setIsPlaying(false);
        }
      }
    },
    [
      songList,
      urlsList,
      isLoop,
      playbackRate,
      stopCurrentAudio,
      initAudioContext,
    ]
  );

  // 时间更新循环
  const updateCurrentTime = useCallback(() => {
    if (
      audioContextRef.current &&
      isPlaying &&
      audioBufferRef.current &&
      audioSourceRef.current
    ) {
      //音频上下文只要一创建就开始计时，与音频链路的创建是无关的，没有音频节点，音频暂停、无音频播放这些情况都不会暂停audioContext.currentTime的继续，是为了所有音频操作提供统一的时间基准
      //elapsed是本次播放了多少时长
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
          // 播放完毕，停止播放并播放下一首
          setIsPlaying(false);
          setCurrentTime(0);
          pauseTimeRef.current = 0;
          stopCurrentAudio();

          if (songList?.songs?.length && currentSongIndex !== null) {
            const nextIndex = (currentSongIndex + 1) % songList.songs.length;
            // 增加请求ID以确保自动播放下一首不会被其他操作中断
            const currentRequestId = ++playRequestIdRef.current;
            setTimeout(() => {
              if (currentRequestId === playRequestIdRef.current) {
                playSongAtIndex(nextIndex, 0);
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
    playSongAtIndex,
  ]);

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

  // 播放/暂停控制（带防抖）
  const togglePlay = useCallback(
    async (song: SongsItem, index: number) => {
      if (!urlsList[index]) return;

      // 清除之前的防抖定时器
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }

      if (currentSong?.hash === song.hash) {
        // 同一首歌，立即执行暂停/播放
        if (isPlaying) {
          pauseAudio();
        } else {
          // 从暂停位置继续播放
          await playSongAtIndex(index, pauseTimeRef.current);
        }
      } else {
        // 新歌曲，使用防抖延迟
        clickTimeoutRef.current = setTimeout(async () => {
          await playSongAtIndex(index, 0);
        }, 150); // 150ms防抖延迟
      }
    },
    [urlsList, currentSong, isPlaying, pauseAudio, playSongAtIndex]
  );

  // 下一首（带防抖）
  const handlePlayNext = useCallback(async () => {
    if (!songList?.songs?.length || currentSongIndex === null) return;

    // 清除点击防抖定时器
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }

    const nextIndex = (currentSongIndex + 1) % songList.songs.length;
    await playSongAtIndex(nextIndex, 0);
  }, [songList, currentSongIndex, playSongAtIndex]);

  // 上一首（带防抖）
  const handlePlayPrev = useCallback(async () => {
    if (!songList?.songs?.length || currentSongIndex === null) return;

    // 清除点击防抖定时器
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }

    const prevIndex =
      (currentSongIndex - 1 + songList.songs.length) % songList.songs.length;
    await playSongAtIndex(prevIndex, 0);
  }, [songList, currentSongIndex, playSongAtIndex]);

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

  // 进度条点击（带防抖）
  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!audioBufferRef.current || !duration || isDragging) return;

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
        // 清除点击防抖定时器
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
        }

        // 进度条跳转使用较短的防抖延迟
        clickTimeoutRef.current = setTimeout(() => {
          playSongAtIndex(currentSongIndex!, clampedSeekTime);
        }, 100);
      }
    },
    [duration, currentSongIndex, urlsList, isDragging, playSongAtIndex]
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

        // 获取歌单中的歌曲！！！！！！！！这里的请求和下面的playlist的应该一致
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

        // 过滤无效歌曲，使用类型断言，因为里面一定会有这些数据
        const validSongs = songsWithData.filter(
          (item) => item !== null && item.url
        ) as {
          song: SongsItem;
          url: string;
          lyrics: LyricLine[];
        }[];

        // 更新状态！！！！！！！！这里应该和前面的统一状态
        setSongList({
          playlist: playListData.data.info[1], //这里的1是我喜欢
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

  // 开始时间更新循环
  useEffect(() => {
    if (isPlaying && audioContextRef.current && audioSourceRef.current) {
      requestRef.current = requestAnimationFrame(updateCurrentTime);
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    };
  }, [isPlaying, updateCurrentTime]);

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

  // 点击歌词跳转（带防抖）
  const handleLyricClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const time = Number(e.currentTarget.dataset.time);
      if (
        !isNaN(time) &&
        currentSongIndex !== null &&
        urlsList[currentSongIndex]
      ) {
        // 清除点击防抖定时器
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
        }

        // 歌词跳转不需要太长的防抖延迟
        clickTimeoutRef.current = setTimeout(() => {
          playSongAtIndex(currentSongIndex!, time);
        }, 50);
      }
    },
    [currentSongIndex, urlsList, playSongAtIndex]
  );

  // 清理资源
  useEffect(() => {
    return () => {
      // 清理防抖定时器
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }

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
