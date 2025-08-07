"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { SongsItem } from "@/types/songlist-types/songsitem";
import { UrlList } from "@/types/songlist-types/urlsList";
import { parseLRC, findCurrentLine } from "@/utils/lrcParser";
import { LyricLine } from "@/types/songlist-types/songsitem";
import "./SongList.scss";

type WebAudioPlayerProps = {
  songs: SongsItem[];
  urlsList: string[];
  textList?: string[];
};

const WebAudioPlayer: React.FC<WebAudioPlayerProps> = ({
  songs,
  urlsList,
  textList = [],
}) => {
  // 播放器状态
  const [currentSong, setCurrentSong] = useState<SongsItem | null>(null);
  const [currentSongIndex, setCurrentSongIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isLoop, setIsLoop] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  // 歌词状态
  const [currentLyrics, setCurrentLyrics] = useState<LyricLine[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);

  // Web Audio API 相关引用
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef(0);
  const pauseTimeRef = useRef(0);
  const animationFrameRef = useRef(0);

  // 可视化
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showVisualizer, setShowVisualizer] = useState(false);

  // 初始化音频上下文
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext ||
        window.webkitAudioContext)();
      gainNodeRef.current = audioContextRef.current.createGain();
      analyserNodeRef.current = audioContextRef.current.createAnalyser();

      analyserNodeRef.current.fftSize = 256;
      gainNodeRef.current.connect(analyserNodeRef.current);
      analyserNodeRef.current.connect(audioContextRef.current.destination);
      gainNodeRef.current.gain.value = isMuted ? 0 : volume;
    }
  }, [isMuted, volume]);

  // 加载音频文件
  const loadAudio = useCallback(
    async (url: string) => {
      initAudioContext();

      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer =
          await audioContextRef.current!.decodeAudioData(arrayBuffer);

        audioBufferRef.current = audioBuffer;
        setDuration(audioBuffer.duration);

        return audioBuffer;
      } catch (error) {
        console.error("加载音频失败:", error);
        return null;
      }
    },
    [initAudioContext]
  );

  // 播放音频
  const playAudio = useCallback(async () => {
    if (!audioBufferRef.current || !audioContextRef.current) return;

    stopAudio();

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.loop = isLoop;
    source.playbackRate.value = playbackRate;

    source.connect(gainNodeRef.current!);
    sourceNodeRef.current = source;

    startTimeRef.current =
      audioContextRef.current.currentTime - (pauseTimeRef.current || 0);
    source.start(0, pauseTimeRef.current || 0);

    source.onended = () => {
      if (!isLoop) {
        handleSongEnded();
      }
    };

    setIsPlaying(true);
    updateTime();
  }, [isLoop, playbackRate]);

  // 暂停音频
  const pauseAudio = useCallback(() => {
    if (!sourceNodeRef.current || !audioContextRef.current) return;

    pauseTimeRef.current =
      audioContextRef.current.currentTime - startTimeRef.current;
    sourceNodeRef.current.stop();
    sourceNodeRef.current = null;

    cancelAnimationFrame(animationFrameRef.current);
    setIsPlaying(false);
  }, []);

  // 停止音频
  const stopAudio = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }

    pauseTimeRef.current = 0;
    startTimeRef.current = 0;
    setCurrentTime(0);

    cancelAnimationFrame(animationFrameRef.current);
    setIsPlaying(false);
  }, []);

  // 更新时间显示
  const updateTime = useCallback(() => {
    if (!audioContextRef.current || !audioBufferRef.current) return;

    const getCurrentTime = () => {
      if (isPlaying) {
        return audioContextRef.current!.currentTime - startTimeRef.current;
      }
      return pauseTimeRef.current;
    };

    const currentTime = Math.min(getCurrentTime(), duration);
    setCurrentTime(currentTime);

    animationFrameRef.current = requestAnimationFrame(updateTime);
  }, [duration, isPlaying]);

  // 歌曲结束时处理
  const handleSongEnded = useCallback(() => {
    if (isLoop) {
      pauseTimeRef.current = 0;
      startTimeRef.current = audioContextRef.current!.currentTime;
      sourceNodeRef.current?.start(0);
    } else {
      handlePlayNext();
    }
  }, [isLoop]);

  // 切换播放/暂停
  const togglePlay = useCallback(
    async (song: SongsItem, index: number) => {
      if (!urlsList[index]) {
        console.log("歌曲URL不存在");
        return;
      }

      if (currentSong?.hash === song.hash) {
        if (isPlaying) {
          pauseAudio();
        } else {
          await playAudio();
        }
      } else {
        setCurrentSong(song);
        setCurrentSongIndex(index);
        setCurrentLyrics(textList[index] ? parseLRC(textList[index]) : []);
        pauseTimeRef.current = 0;

        await loadAudio(urlsList[index]);
        await playAudio();
      }
    },
    [currentSong, isPlaying, urlsList, textList, playAudio, pauseAudio]
  );

  // 下一首
  const handlePlayNext = useCallback(() => {
    if (!songs.length || currentSongIndex === null) {
      setIsPlaying(false);
      return;
    }

    let nextIndex = currentSongIndex;
    let found = false;

    for (let i = 1; i <= songs.length; i++) {
      nextIndex = (currentSongIndex + i) % songs.length;
      if (urlsList[nextIndex]) {
        found = true;
        break;
      }
    }

    if (found) {
      setCurrentSongIndex(nextIndex);
      setCurrentSong(songs[nextIndex]);
      setCurrentLyrics(
        textList[nextIndex] ? parseLRC(textList[nextIndex]) : []
      );

      loadAudio(urlsList[nextIndex]).then(() => {
        playAudio();
      });
    } else {
      setIsPlaying(false);
    }
  }, [currentSongIndex, songs, urlsList, textList, playAudio]);

  // 上一首
  const handlePlayPrev = useCallback(() => {
    if (currentSongIndex === null || !songs.length) return;

    const prevIndex = (currentSongIndex - 1 + songs.length) % songs.length;
    const prevSong = songs[prevIndex];

    setCurrentSong(prevSong);
    setCurrentSongIndex(prevIndex);
    setCurrentLyrics(textList[prevIndex] ? parseLRC(textList[prevIndex]) : []);

    loadAudio(urlsList[prevIndex]).then(() => {
      playAudio();
    });
  }, [currentSongIndex, songs, urlsList, textList, playAudio]);

  // 进度控制
  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!audioBufferRef.current || !duration) return;

      const progressBar = e.currentTarget;
      const rect = progressBar.getBoundingClientRect();
      const clickPosition = Math.max(
        0,
        Math.min(e.clientX - rect.left, rect.width)
      );
      const seekTime = (clickPosition / rect.width) * duration;

      pauseTimeRef.current = seekTime;
      setCurrentTime(seekTime);

      if (isPlaying) {
        playAudio();
      }
    },
    [duration, isPlaying, playAudio]
  );

  // 音量控制
  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(e.target.value);
      setVolume(newVolume);

      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = newVolume;
        setIsMuted(newVolume === 0);
      }
    },
    []
  );

  const toggleMute = useCallback(() => {
    if (gainNodeRef.current) {
      const newMuted = !isMuted;
      gainNodeRef.current.gain.value = newMuted ? 0 : volume;
      setIsMuted(newMuted);
    }
  }, [isMuted, volume]);

  // 倍速控制
  const changePlaybackRate = useCallback(() => {
    const rates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    const newRate = rates[nextIndex];

    setPlaybackRate(newRate);

    if (sourceNodeRef.current) {
      sourceNodeRef.current.playbackRate.value = newRate;
    }
  }, [playbackRate]);

  // 音频可视化
  const drawVisualizer = useCallback(() => {
    if (!showVisualizer || !canvasRef.current || !analyserNodeRef.current)
      return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const analyser = analyserNodeRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = "rgb(20, 20, 20)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;

        ctx.fillStyle = `rgb(100, 200, ${barHeight + 100})`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();
  }, [showVisualizer]);

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // 获取封面URL
  const getCoverUrl = (song: SongsItem) => {
    if (!song) return "/default-cover.jpg";
    return song.cover?.replace("{size}", "480") || "/default-cover.jpg";
  };

  // 歌词时间更新
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
  }, [currentTime, currentLyrics, currentLineIndex]);

  // 歌词滚动效果
  useEffect(() => {
    if (!lyricsContainerRef.current || currentLineIndex === -1) return;

    const container = lyricsContainerRef.current;
    const activeLine = container.children[currentLineIndex] as HTMLElement;
    if (!activeLine) return;

    const containerHeight = container.clientHeight;
    const lineHeight = activeLine.offsetHeight;
    const lineTop = activeLine.offsetTop;

    container.scrollTo({
      top: lineTop - (containerHeight - lineHeight) / 2,
      behavior: "smooth",
    });
  }, [currentLineIndex]);

  // 清理资源
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
      }
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // 切换可视化效果
  useEffect(() => {
    if (showVisualizer) {
      drawVisualizer();
    } else {
      cancelAnimationFrame(animationFrameRef.current);

      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          ctx.clearRect(
            0,
            0,
            canvasRef.current.width,
            canvasRef.current.height
          );
        }
      }
    }
  }, [showVisualizer, drawVisualizer]);

  return (
    <div className="container">
      {/* 可视化画布 */}
      {showVisualizer && (
        <canvas
          ref={canvasRef}
          width={800}
          height={200}
          className="visualizer"
        />
      )}

      {/* 歌曲列表 */}
      <div className="songList">
        <h2 className="listTitle">播放列表</h2>
        <div className="listContainer">
          {songs.map((song, index) => (
            <div
              key={`${song.hash}-${index}`}
              className={`songItem ${currentSong?.hash === song.hash ? "active" : ""}`}
              onClick={() => togglePlay(song, index)}
            >
              <img
                src={getCoverUrl(song)}
                alt={song.name}
                className="cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/default-cover.jpg";
                }}
              />
              <div className="songInfo">
                <div className="songName">{song.name}</div>
              </div>
              {currentSong?.hash === song.hash && isPlaying && (
                <div className="playingIndicator">▶</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 当前播放和歌词 */}
      <div className="playerDisplay">
        {currentSong && (
          <>
            <div className="songDisplay">
              <img
                src={getCoverUrl(currentSong)}
                alt={currentSong.name}
                className="currentCover"
              />
              <div className="songDetails">
                <h3 className="currentSongName">{currentSong.name}</h3>
              </div>
            </div>

            <div ref={lyricsContainerRef} className="lyricsContainer">
              {currentLyrics.length > 0 ? (
                currentLyrics.map((line, index) => (
                  <div
                    key={`${line.time}-${index}`}
                    className={`lyricLine ${index === currentLineIndex ? "active" : ""}`}
                    data-time={line.time}
                    onClick={() => {
                      pauseTimeRef.current = line.time;
                      setCurrentTime(line.time);
                      if (isPlaying) playAudio();
                    }}
                  >
                    {line.text}
                  </div>
                ))
              ) : (
                <div className="noLyrics">暂无歌词</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 播放器控制面板 */}
      <div className="controls">
        <div className="progressContainer">
          <div className="timeDisplay">{formatTime(currentTime)}</div>
          <div
            className="progressBar"
            onClick={handleProgressClick}
            // onMouseDown={handleMouseDown}
            onMouseMove={isDragging ? handleProgressClick : undefined}
            // onMouseUp={handleMouseUp}
            // onMouseLeave={handleMouseUp}
          >
            <div
              className="progressFill"
              style={{
                width: `${duration ? (currentTime / duration) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="timeDisplay">{formatTime(duration)}</div>
        </div>

        <div className="buttons">
          <button
            className={`controlButton ${isLoop ? "active" : ""}`}
            onClick={() => {
              setIsLoop(!isLoop);
              if (sourceNodeRef.current) {
                sourceNodeRef.current.loop = !isLoop;
              }
            }}
            title="循环播放"
          >
            🔁
          </button>

          <button
            className="controlButton"
            onClick={handlePlayPrev}
            disabled={!currentSong}
            title="上一首"
          >
            ⏮
          </button>

          <button
            className="playButton"
            onClick={() =>
              currentSong &&
              currentSongIndex !== null &&
              togglePlay(currentSong, currentSongIndex)
            }
            disabled={!currentSong}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          <button
            className="controlButton"
            onClick={handlePlayNext}
            disabled={!currentSong}
            title="下一首"
          >
            ⏭
          </button>

          <button
            className="controlButton"
            onClick={changePlaybackRate}
            title="播放速度"
          >
            {playbackRate.toFixed(2)}x
          </button>
        </div>

        <div className="volumeContainer">
          <button
            className="volumeButton"
            onClick={toggleMute}
            title={isMuted ? "取消静音" : "静音"}
          >
            {isMuted ? "🔇" : volume > 0.5 ? "🔊" : "🔉"}
          </button>

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="volumeSlider"
          />
        </div>

        <button
          className={`visualizerButton ${showVisualizer ? "active" : ""}`}
          onClick={() => setShowVisualizer(!showVisualizer)}
        >
          {showVisualizer ? "隐藏波形" : "显示波形"}
        </button>
      </div>
    </div>
  );
};
export default WebAudioPlayer;
