//使用原生audio
"use client";

import React, { useState, useRef, useEffect, useCallback, use } from "react";
import { SongsItem } from "@/types/songlist-types/songsitem";
import { UrlList } from "@/types/songlist-types/urlsList";
//引入歌词解析函数
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
  //用于控制拖动
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // 歌单相关状态
  const [playList, setPlayList] = useState<any>("");
  const [songList, setSongList] = useState<any>("");
  const [urlsList, setUrlsList] = useState<UrlList>([]);
  //定义歌词文件
  const [textList, setTextList] = useState<any>();
  const [currentSongIndex, setCurrentSongIndex] = useState<number | null>(null);
  //歌词滚动
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  //音量控制
  const [volume, setVolume] = useState(0.7); // 默认音量70%
  const [isMuted, setIsMuted] = useState(false);
  // 用户名状态
  const [username, setUsername] = useState<string>("default");

  // 用户偏好函数
  const getUserPreference = useCallback(
    (key: string): any => {
      try {
        if (typeof window === "undefined") return null;
        const allPrefs = JSON.parse(
          localStorage.getItem("userPreferences") || "{}"
        );
        return allPrefs[username]?.[key] ?? null;
      } catch (error) {
        console.error("读取偏好失败:", error);
        return null;
      }
    },
    [username]
  );
  //保存偏好
  const saveUserPreference = useCallback(
    (key: string, value: any) => {
      try {
        if (typeof window === "undefined") return;
        const allPrefs = JSON.parse(
          localStorage.getItem("userPreferences") || "{}"
        );

        if (!allPrefs[username]) {
          allPrefs[username] = {};
        }

        allPrefs[username][key] = value;
        localStorage.setItem("userPreferences", JSON.stringify(allPrefs));
      } catch (error) {
        console.error("保存偏好失败:", error);
      }
    },
    [username]
  );

  // 初始化用户数据,可以获取当前的用户名字
  useEffect(() => {
    const storedUsername = localStorage.getItem("currentUsername") || "default";
    setUsername(storedUsername);

    // 加载偏好设置
    const loadPreferences = () => {
      const rate = getUserPreference("playbackRate");
      if (rate !== null && audioRef.current) {
        setPlaybackRate(rate);
        audioRef.current.playbackRate = rate;
      }

      const loop = getUserPreference("isLoop");
      if (loop !== null) setIsLoop(loop);
    };

    if (storedUsername !== "default") {
      loadPreferences();
    }
  }, []);
  // 倍速播放,从本地读取
  const [playbackRate, setPlaybackRate] = useState<number>(() => {
    const saved = getUserPreference("playbackRate");
    return saved !== null ? saved : 1.0;
  });
  //循环播放
  const [isLoop, setIsLoop] = useState<boolean>(() => {
    const saved = getUserPreference("isLoop");
    return saved !== null ? saved : false;
  });
  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };
  // 获取封面URL - 统一处理函数
  const getCoverUrl = (song: any) => {
    if (!song) return;
    return song.cover.replace("{size}", "480");
  };

  //!!!!!每次刷新应该重新获取播放列表,fetch到列表数据,利用usecallback(),useMemo()来对比两次请求的差异,如果没变那么就不用变,如果变了就重新渲染,这样节流!!!!!!!!!
  //  获取歌单数据,应该
  useEffect(() => {
    const getPlayList = async () => {
      try {
        const playListRes = await fetch(`http://localhost:3000/user/playlist`, {
          credentials: "include",
        });
        const playListData: PlayListResponse = await playListRes.json();
        setPlayList(playListData);

        const playListArray = playListData.data.info.map((item) => ({
          name: item.name,
          global_collection_id: item.global_collection_id,
        }));

        const getPlayListSongArray = playListArray.map(async (item) => {
          try {
            const res = await fetch(
              `http://localhost:3000/playlist/track/all?id=${item.global_collection_id}`,
              { credentials: "include" }
            );
            const listSongData: SongListResponse = await res.json();
            return {
              playlist: item,
              songs: listSongData.data?.songs || [],
            };
          } catch (error) {
            console.log(`获取歌单歌曲失败`);
            return { songs: [] as SongsItem[] };
          }
        });

        const allSongs = await Promise.all(getPlayListSongArray);
        setSongList(allSongs);
        // 获取歌曲URL - 修改为只保留有有效URL的歌曲
        if (allSongs[1]?.songs) {
          const songsWithUrls = await Promise.all(
            allSongs[1].songs.map(async (item: any) => {
              try {
                const [urlRes, lyricRes] = await Promise.all([
                  fetch(
                    //音质选择
                    `http://localhost:3000/song/url/?hash=${item.hash}&quality=flac`,
                    {
                      credentials: "include",
                    }
                  ),
                  fetch(
                    `http://localhost:3000/search/lyric?hash=${item.hash}`,
                    {
                      credentials: "include",
                    }
                  ),
                ]);

                const [data, lyricData] = await Promise.all([
                  urlRes.json(),
                  lyricRes.json(),
                ]);

                const candidate = lyricData.candidates?.[0];
                let songsTextData = null;

                if (candidate) {
                  try {
                    const textDataRes = await fetch(
                      `http://localhost:3000/lyric?id=${candidate.id}&accesskey=${candidate.accesskey}&fmt=lrc&decode=true`,
                      { credentials: "include" }
                    );
                    const textData = await textDataRes.json();
                    songsTextData = textData.decodeContent;
                  } catch (error) {
                    console.error("歌词详情请求失败:", error);
                  }
                }

                return {
                  song: item,
                  url: data.url?.[0],
                  songsTextData,
                };
              } catch (err) {
                console.log("获取url失败");
                return null;
              }
            })
          );
          // 过滤掉无效的歌曲
          const validSongs = songsWithUrls.filter(
            (
              item
            ): item is {
              song: SongsItem;
              url: string;
              songsTextData: string;
            } => item !== null && item.url
          );

          // 更新URL列表和歌曲列表
          setUrlsList(validSongs.map((item) => item.url));
          setTextList(
            validSongs.map((item) => {
              return item.songsTextData ? parseLRC(item.songsTextData) : null;
            })
          );
          // 更新歌曲列表，只保留有有效URL的歌曲
          allSongs[1].songs = validSongs.map((item) => item.song);
          setSongList([...allSongs]);

          // 如果当前播放的歌曲已被删除，重置播放状态
          if (
            currentSong &&
            !validSongs.some((item) => item.song.hash === currentSong.hash)
          ) {
            setCurrentSong(null);
            setCurrentSongIndex(null);
            setIsPlaying(false);
          }
        }
      } catch (error) {
        console.log("没有获取到列表");
      }
    };
    getPlayList();
  }, []);

  // 歌曲结束时,判断是否循环,不循环直接播放下一首,循环重复现在的歌曲
  const handleSongEnded = () => {
    if (isLoop) {
      // 单曲循环：重置当前歌曲时间
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else {
      // 正常播放下一首
      handlePlayNext();
    }
  };
  //切换是否循环播放
  const toggleLoop = () => {
    setIsLoop(!isLoop);
    //保存
    saveUserPreference("isLoop", !isLoop);
  };
  // 播放/暂停控制
  const togglePlay = (song: SongsItem, index: number) => {
    // 确保索引对应的URL存在
    if (!urlsList[index]) {
      console.log("歌曲URL不存在，无法播放");
      return;
    }

    if (currentSong?.hash === song.hash) {
      // 同一首歌
      if (isPlaying) {
        audioRef.current?.pause();
      } else {
        audioRef.current?.play();
      }
      setIsPlaying(!isPlaying);
    } else {
      // 新歌曲
      setCurrentSong(song);
      setCurrentSongIndex(index);
      setIsPlaying(true);
      setTimeout(() => {
        audioRef.current?.play();
      }, 0);
    }
  };

  // 下一首
  useEffect(() => {
    if (isPlaying && currentSong && audioRef.current) {
      // 尝试播放，失败时暂停
      audioRef.current.play().catch((error) => {
        console.error("播放失败:", error);
        setIsPlaying(false);
      });
    }
  }, [currentSong, isPlaying]);

  // 修改后的 handlePlayNext 函数
  const handlePlayNext = () => {
    if (!myLoveSongs.length || currentSongIndex === null) {
      setIsPlaying(false);
      return;
    }

    // 查找下一首有效歌曲
    let nextIndex = currentSongIndex;
    let found = false;
    //找到真的有效的一首歌,防止有些歌曲没有url
    for (let i = 1; i <= myLoveSongs.length; i++) {
      nextIndex = (currentSongIndex + i) % myLoveSongs.length;
      if (urlsList[nextIndex]) {
        found = true;
        break;
      }
    }

    if (!found) {
      setIsPlaying(false);
      return;
    }

    // 更新状态（会自动触发上面的 useEffect）
    setCurrentSongIndex(nextIndex);
    setCurrentSong(myLoveSongs[nextIndex]);
    setIsPlaying(true); // 设置为播放状态
  };

  // 上一首
  const handlePlayPrev = () => {
    if (currentSongIndex === null || !myLoveSongs.length) return;
    const prevIndex =
      (currentSongIndex - 1 + myLoveSongs.length) % myLoveSongs.length;
    const prevSong = myLoveSongs[prevIndex];

    setCurrentSong(prevSong);
    setCurrentSongIndex(prevIndex);
    setIsPlaying(true);

    setTimeout(() => {
      audioRef.current?.play();
    }, 0);
  };

  const myLoveSongs = songList[1]?.songs || [];
  const renderCurrentSong = () => {
    // 如果当前歌曲索引无效或URL不存在，不显示播放器
    if (currentSongIndex === null || !urlsList[currentSongIndex]) {
      return null;
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;

    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    // 计算点击位置（限制在0到宽度之间）
    const clickPosition = Math.max(
      0,
      Math.min(e.clientX - rect.left, rect.width)
    );
    const seekTime = (clickPosition / rect.width) * duration;

    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  //拖动进度条,而不是点击,分为三个阶段,鼠标点击,移动鼠标,鼠标松开
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    //点击后立刻移动到目标位置
    handleProgressClick(e);
    e.preventDefault();
  };
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    //在拖动的话,直接用上面的点击函数就行
    if (isDragging) handleProgressClick(e);
  };

  // 防止鼠标移出进度条时中断拖动
  const handleProgressUpdate = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;

    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    // 计算相对位置（限制在0到宽度之间）
    const clickPosition = Math.max(
      0,
      Math.min(e.clientX - rect.left, rect.width)
    );
    const seekTime = (clickPosition / rect.width) * duration;

    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  // 处理鼠标松开（结束拖动）
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 添加全局事件监听确保可靠结束拖动
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) setIsDragging(false);
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        // 转换为React合成事件
        const syntheticEvent = {
          clientX: e.clientX,
          currentTarget: document.querySelector(".time-bar"),
          // 其他需要属性...
        } as unknown as React.MouseEvent<HTMLDivElement>;
        handleProgressUpdate(syntheticEvent);
      }
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    window.addEventListener("mousemove", handleGlobalMouseMove);

    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("mousemove", handleGlobalMouseMove);
    };
  }, [isDragging]);

  // 时间更新处理函数 e: React.SyntheticEvent<HTMLAudioElement>是react封装的原生对象事件,包含音频元素信息
  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget;
    setCurrentTime(audio.currentTime);
  };

  // 2. 获取音频元数据
  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    setDuration(e.currentTarget.duration);
  };
  //用于处理跳秒的问题
  //问题是浏览器会自动限制时间更新的频率,当主线进程繁忙时会出现事件合并,出现跳秒的情况
  //react也会出现快速连续的状态更新会被合并,多个 setCurrentTime(audio.currentTime);可能只会触发一次渲染
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEventUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    //requestAnimationFrame,rAF是浏览器提供的专门用于动画渲染的高性能API
    //     浏览器每帧（Frame）的渲染流程包括：
    // JavaScript → Style → Layout → Paint → Composite
    // rAF 会在每一帧 开始绘制之前 执行回调函数，确保动画和渲染同步。
    let rafId: number;
    const handleAnimationFrame = () => {
      setCurrentTime(audio.currentTime);
      rafId = requestAnimationFrame(handleAnimationFrame); //循环调用
    };

    audio.addEventListener("timeupdate", handleEventUpdate);
    if (isPlaying) rafId = requestAnimationFrame(handleAnimationFrame);
    //销毁
    return () => {
      audio.removeEventListener("timeupdate", handleEventUpdate);
      //     cancelAnimationFrame(rafId);
    };
  }, [isPlaying]);
  //歌词滚动

  // 安全获取当前歌词
  const currentLyrics = textList?.[currentSongIndex ?? 0] ?? [];

  // 时间更新处理
  useEffect(() => {
    if (!currentLyrics.length) {
      setCurrentLineIndex(-1);
      return;
    }

    const newIndex = findCurrentLine(
      currentTime,
      currentLyrics,
      currentLineIndex
    );
    if (newIndex !== currentLineIndex) setCurrentLineIndex(newIndex);
  }, [currentTime, currentLyrics]);

  // 平滑滚动
  useEffect(() => {
    if (!lyricsContainerRef.current || currentLineIndex === -1) return;

    const container = lyricsContainerRef.current;
    const activeLine = container.children[currentLineIndex] as HTMLElement;
    if (!activeLine) return;

    let rafId: number;
    let startTime: number;
    const duration = 300;
    const startScroll = container.scrollTop;
    const targetScroll =
      activeLine.offsetTop -
      (container.clientHeight - activeLine.offsetHeight) / 2;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      container.scrollTop =
        startScroll + (targetScroll - startScroll) * progress;
      if (progress < 1) rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [currentLineIndex]);

  //点击歌词跳转
  const handleSongText = (e: React.MouseEvent<HTMLDivElement>) => {
    //点击获取歌词的时间
    const textTime = Number(e.currentTarget.dataset.time);
    //添加类型检查
    if (audioRef.current) {
      audioRef.current.currentTime = textTime;
      setCurrentTime(textTime);
    }
  };

  //搜索歌曲改变歌单

  //音量控制
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
      setIsMuted(newVolume === 0);
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      const newMuted = !isMuted;
      audioRef.current.volume = newMuted ? 0 : volume;
      setIsMuted(newMuted);
    }
  };
  //倍速,修改playbackRate来进行切换播放速度
  const changePlaybackRate = () => {
    const rates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]; // 支持的倍速选项
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    const newRate = rates[nextIndex];

    setPlaybackRate(newRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
    //保存倍速
    saveUserPreference("playbackRate", newRate);
  };
  return (
    <div className="song-player-container">
      {/* 歌曲列表 */}
      <div className="song-list">
        <div className="list-title">
          {songList[1]?.playlist?.name || "加载中..."}
        </div>
        <div className="song-list-container">
          {myLoveSongs.map((item: SongsItem, index: number) => {
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
                {isCurrent && isPlaying ? (
                  <span className="playing-icon">⏸</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* 歌词展示以及主页面 */}
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
                {currentLyrics.length > 0 ? (
                  currentLyrics.map((line: LyricLine, index: number) => (
                    <div
                      key={`${line.time}-${index}`}
                      className={`lyric-line ${index === currentLineIndex ? "active" : ""}`}
                      data-time={line.time}
                      onClick={handleSongText}
                    >
                      {line.text || " "}
                    </div>
                  ))
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
          <audio
            ref={audioRef}
            src={urlsList[currentSongIndex || 0]}
            onEnded={handleSongEnded}
            onTimeUpdate={handleTimeUpdate} // 新增时间更新监听
            onLoadedMetadata={handleLoadedMetadata} // 推荐添加：获取音频时长
          />

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
                    if (currentSong) {
                      togglePlay(currentSong, currentSongIndex || 0);
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
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
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
      {renderCurrentSong()}
    </div>
  );
}
