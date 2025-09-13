"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { SimpleSong, LyricLine } from "@/types/songlist-types/songsitem";
import { UrlList } from "@/types/songlist-types/urlsList";

interface UseAudioPlayerProps {
  songList: { playlist: any; songs: SimpleSong[] } | null;
  urlsList: UrlList;
  textList: LyricLine[][];
}

export default function useAudioPlayer({
  songList,
  urlsList,
  textList,
}: UseAudioPlayerProps) {
  // 播放器状态
  const [currentSongIndex, setCurrentSongIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isLooping, setIsLooping] = useState(false);

  // Web Audio API refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);

  // 播放状态追踪
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  const isInitializedRef = useRef<boolean>(false);
  const playRequestIdRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  // 添加一个ref来跟踪真实的播放状态，避免异步状态更新问题
  const isPlayingRef = useRef<boolean>(false);

  // 获取当前歌曲
  const currentSong =
    currentSongIndex !== null && songList && songList.songs
      ? songList.songs[currentSongIndex]
      : null;

  // 获取当前歌词
  const currentLyrics =
    currentSongIndex !== null ? textList[currentSongIndex] || [] : [];

  // 更新播放状态的辅助函数
  const updatePlayingState = useCallback((playing: boolean) => {
    isPlayingRef.current = playing;
    setIsPlaying(playing);
  }, []);

  // 优化的歌词同步算法
  const findCurrentLyricLine = useCallback(
    (time: number, lyrics: LyricLine[]) => {
      if (!lyrics.length) return -1;
      let result = -1;
      for (let i = 0; i < lyrics.length; i++) {
        if (lyrics[i].time <= time) {
          result = i;
        } else {
          break;
        }
      }
      return result;
    },
    []
  );

  // 循环模式切换函数
  const handleLoopModeChange = useCallback(() => {
    setIsLooping((prev) => !prev);
  }, []);

  // 检查音频上下文是否活跃
  const ensureAudioContextActive = useCallback(async () => {
    if (audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume();
    }
  }, []);

  // 检查是否准备好播放
  const isReadyToPlay = useCallback(() => {
    return !!(
      audioBufferRef.current &&
      audioContextRef.current &&
      gainNodeRef.current
    );
  }, []);

  // 初始化Web Audio Context
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();

      // 创建音频节点
      gainNodeRef.current = audioContextRef.current.createGain();
      analyserRef.current = audioContextRef.current.createAnalyser();

      // 设置初始音量
      gainNodeRef.current.gain.value = volume;

      // 连接节点：gain -> analyser -> destination
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
  }, [volume]);

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
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  // 进度更新循环
  const updateProgress = useCallback(() => {
    const ctx = audioContextRef.current;
    const src = audioSourceRef.current;
    const buf = audioBufferRef.current;

    if (ctx && src && buf) {
      const elapsed = ctx.currentTime - startTimeRef.current;
      const newCurrentTime = pauseTimeRef.current + elapsed * playbackRate;

      if (newCurrentTime >= buf.duration) {
        // 达到或超过总时长则触发结束逻辑
        setCurrentTime(buf.duration);
        updatePlayingState(false);
        stopCurrentAudio();

        if (isLooping && currentSongIndex !== null && isReadyToPlay()) {
          setTimeout(() => {
            restartCurrentSong();
          }, 50);
        } else {
          playNextImplementation();
        }
        return;
      } else {
        setCurrentTime(newCurrentTime);
      }

      animationFrameRef.current = requestAnimationFrame(updateProgress);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
  }, [
    playbackRate,
    isLooping,
    currentSongIndex,
    stopCurrentAudio,
    isReadyToPlay,
    updatePlayingState,
  ]);

  // 快速重启当前歌曲（用于循环播放）
  const restartCurrentSong = useCallback(async () => {
    if (!isReadyToPlay() || currentSongIndex === null) {
      return;
    }

    try {
      await ensureAudioContextActive();

      // 停止当前播放
      stopCurrentAudio();

      // 重置时间状态
      setCurrentTime(0);
      pauseTimeRef.current = 0;
      startTimeRef.current = audioContextRef.current!.currentTime;

      // 创建新的音频源节点
      const source = audioContextRef.current!.createBufferSource();
      source.buffer = audioBufferRef.current!;
      source.playbackRate.value = playbackRate;

      // 连接到音频图
      source.connect(gainNodeRef.current!);
      audioSourceRef.current = source;

      // 开始播放
      source.start(0, 0);
      updatePlayingState(true);

      // 开始进度更新
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(updateProgress);

      // 设置播放结束事件
      source.onended = () => {
        if (audioSourceRef.current === source) {
          updatePlayingState(false);
        }
      };
    } catch (error) {
      console.error("重启歌曲失败:", error);
      updatePlayingState(false);
    }
  }, [
    currentSongIndex,
    playbackRate,
    stopCurrentAudio,
    ensureAudioContextActive,
    isReadyToPlay,
    updateProgress,
    updatePlayingState,
  ]);

  // 从当前音频缓冲区创建播放源
  const createAndStartSource = useCallback(
    async (startTime: number = 0, shouldPlay: boolean = true) => {
      if (!isReadyToPlay() || !audioContextRef.current) {
        return false;
      }

      try {
        await ensureAudioContextActive();

        // 停止当前播放
        stopCurrentAudio();

        // 计算有效的开始时间
        const validStartTime = Math.max(
          0,
          Math.min(startTime, audioBufferRef.current!.duration)
        );

        // 设置时间状态
        pauseTimeRef.current = validStartTime;
        setCurrentTime(validStartTime);

        if (shouldPlay) {
          // 创建新的音频源节点并播放
          const source = audioContextRef.current!.createBufferSource();
          source.buffer = audioBufferRef.current!;
          source.playbackRate.value = playbackRate;

          // 连接到音频图
          source.connect(gainNodeRef.current!);
          audioSourceRef.current = source;

          startTimeRef.current = audioContextRef.current!.currentTime;

          // 开始播放
          source.start(0, validStartTime);
          updatePlayingState(true);

          // 开始进度更新
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
          }
          animationFrameRef.current = requestAnimationFrame(updateProgress);

          // 设置播放结束事件
          source.onended = () => {
            updatePlayingState(false);
          };
        } else {
          // 只是跳转，不创建新的播放源，保持暂停状态
          startTimeRef.current = audioContextRef.current!.currentTime;
        }

        return true;
      } catch (error) {
        console.error("创建播放源失败:", error);
        if (shouldPlay) {
          updatePlayingState(false);
        }
        return false;
      }
    },
    [
      playbackRate,
      stopCurrentAudio,
      ensureAudioContextActive,
      isReadyToPlay,
      updateProgress,
      updatePlayingState,
    ]
  );

  // 声明 playNextImplementation
  const playNextImplementation = useCallback(async () => {
    if (songList && currentSongIndex !== null) {
      const nextIndex = (currentSongIndex + 1) % songList.songs.length;
      await playSongAtIndexImplementation(nextIndex, true);
    } else if (songList && songList.songs.length > 0) {
      await playSongAtIndexImplementation(0, true);
    }
  }, [songList, currentSongIndex]);

  // 在当前歌曲内跳转函数
  const seekInCurrentSong = useCallback(
    async (time: number, shouldAutoPlay: boolean = false) => {
      if (
        !audioBufferRef.current ||
        !audioContextRef.current ||
        currentSongIndex === null
      ) {
        return;
      }

      const seekTime = Math.max(
        0,
        Math.min(time, audioBufferRef.current.duration)
      );

      const wasPlaying = isPlayingRef.current;

      if (wasPlaying) {
        // 如果正在播放，跳转并继续播放
        await createAndStartSource(seekTime, true);
      } else if (shouldAutoPlay) {
        // 如果要求自动播放，开始播放
        await createAndStartSource(seekTime, true);
      } else {
        // 只跳转，不播放
        await createAndStartSource(seekTime, false);
      }
    },
    [currentSongIndex, createAndStartSource]
  );

  // 播放指定索引的歌曲实现
  const playSongAtIndexImplementation = useCallback(
    async (index: number, shouldPlay: boolean = true, seekTime: number = 0) => {
      if (
        !songList?.songs?.length ||
        index < 0 ||
        index >= songList.songs.length ||
        !urlsList[index]
      ) {
        console.error("歌曲数据不存在");
        return;
      }

      // 如果是相同歌曲且已经加载，直接跳转
      if (
        index === currentSongIndex &&
        audioBufferRef.current &&
        seekTime > 0
      ) {
        await seekInCurrentSong(seekTime, shouldPlay);
        return;
      }

      // 生成新的请求ID，用于防抖
      const currentRequestId = ++playRequestIdRef.current;

      // 停止当前播放
      stopCurrentAudio();
      updatePlayingState(false);
      setIsLoading(true);
      setCurrentSongIndex(index);
      setCurrentLineIndex(0);

      // 只在加载新歌曲时重置时长，跳转时保持原有时长
      if (index !== currentSongIndex) {
        setDuration(0);
      }

      setCurrentTime(seekTime);
      pauseTimeRef.current = seekTime;
      startTimeRef.current = 0;

      try {
        // 检查是否还是最新的请求
        if (currentRequestId !== playRequestIdRef.current) {
          return;
        }

        // 初始化音频上下文
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
        setDuration(audioBuffer.duration);
        setIsLoading(false);

        if (shouldPlay) {
          await createAndStartSource(seekTime, true);
        } else {
          setCurrentTime(seekTime);
          pauseTimeRef.current = seekTime;
        }
      } catch (error) {
        console.error("播放失败:", error);
        updatePlayingState(false);
        setIsLoading(false);
        if (error instanceof Error && error.name === "NotAllowedError") {
          console.warn("需要用户交互才能播放音频");
        }
      }
    },
    [
      songList,
      urlsList,
      currentSongIndex,
      stopCurrentAudio,
      initAudioContext,
      seekInCurrentSong,
      createAndStartSource,
      updatePlayingState,
    ]
  );

  // 修复后的歌曲结束处理逻辑
  const handleSongEnd = useCallback(() => {
    updatePlayingState(false);
    stopCurrentAudio();

    if (isLooping && currentSongIndex !== null && isReadyToPlay()) {
      setTimeout(() => {
        restartCurrentSong();
      }, 50);
    } else {
      playNextImplementation();
    }
  }, [
    isLooping,
    currentSongIndex,
    stopCurrentAudio,
    isReadyToPlay,
    restartCurrentSong,
    updatePlayingState,
  ]);

  // 优化后的 seek 函数 - 使用ref避免状态异步问题
  const seek = useCallback(
    (time: number) => {
      if (!isNaN(time) && time >= 0 && duration > 0) {
        const seekTime = Math.min(time, duration);

        if (
          audioBufferRef.current &&
          currentSongIndex !== null &&
          audioContextRef.current
        ) {
          // 使用ref获取真实的播放状态，避免异步状态问题
          const wasPlaying = isPlayingRef.current;

          try {
            // 停止当前播放
            stopCurrentAudio();

            // 更新时间
            setCurrentTime(seekTime);
            pauseTimeRef.current = seekTime;
            startTimeRef.current = audioContextRef.current.currentTime;

            if (wasPlaying) {
              // 如果之前在播放，创建新源并继续播放
              const source = audioContextRef.current.createBufferSource();
              source.buffer = audioBufferRef.current;
              source.playbackRate.value = playbackRate;
              source.connect(gainNodeRef.current!);
              audioSourceRef.current = source;

              source.start(0, seekTime);
              updatePlayingState(true);

              // 开始进度更新
              if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
              }
              animationFrameRef.current = requestAnimationFrame(updateProgress);

              source.onended = () => {
                updatePlayingState(false);
              };
            }
            // 如果之前是暂停状态，就保持暂停，不调用 updatePlayingState
          } catch (error) {
            console.error("跳转失败:", error);
          }
        } else if (currentSongIndex !== null && urlsList[currentSongIndex]) {
          setCurrentTime(seekTime);
          pauseTimeRef.current = seekTime;
          playSongAtIndexImplementation(
            currentSongIndex,
            isPlayingRef.current,
            seekTime
          );
        }
      }
    },
    [
      duration,
      currentSongIndex,
      urlsList,
      playbackRate,
      stopCurrentAudio,
      updateProgress,
      playSongAtIndexImplementation,
      updatePlayingState,
    ]
  );

  // 修复后的播放/暂停切换
  const togglePlay = useCallback(
    async (song?: SimpleSong) => {
      if (!songList || !songList.songs.length) {
        console.warn("歌单为空");
        return;
      }

      if (song) {
        // 指定了歌曲
        const index = songList.songs.findIndex((s) => s.hash === song.hash);
        if (index === -1) {
          console.error("歌曲不在当前歌单中");
          return;
        }

        if (currentSongIndex === index) {
          // 同一首歌，切换播放状态
          if (isPlayingRef.current) {
            // 暂停
            if (audioContextRef.current) {
              // 记录已播放时间
              const elapsed =
                (audioContextRef.current.currentTime - startTimeRef.current) *
                playbackRate;
              pauseTimeRef.current += elapsed;
              updatePlayingState(false);
              stopCurrentAudio();
            }
          } else {
            // 从暂停位置继续播放
            if (isReadyToPlay()) {
              await createAndStartSource(pauseTimeRef.current, true);
            } else {
              await playSongAtIndexImplementation(
                index,
                true,
                pauseTimeRef.current
              );
            }
          }
        } else {
          // 播放新歌曲
          await playSongAtIndexImplementation(index, true);
        }
      } else {
        // 没有指定歌曲
        if (currentSongIndex === null) {
          // 没有选中歌曲，播放第一首
          await playSongAtIndexImplementation(0, true);
        } else {
          // 有选中歌曲，切换播放状态
          if (isPlayingRef.current) {
            // 暂停
            if (audioContextRef.current) {
              const elapsed =
                (audioContextRef.current.currentTime - startTimeRef.current) *
                playbackRate;
              pauseTimeRef.current += elapsed;
              updatePlayingState(false);
              stopCurrentAudio();
            }
          } else {
            // 从暂停位置继续播放
            if (isReadyToPlay()) {
              await createAndStartSource(pauseTimeRef.current, true);
            } else {
              await playSongAtIndexImplementation(
                currentSongIndex,
                true,
                pauseTimeRef.current
              );
            }
          }
        }
      }
    },
    [
      songList,
      currentSongIndex,
      playbackRate,
      playSongAtIndexImplementation,
      stopCurrentAudio,
      isReadyToPlay,
      createAndStartSource,
      updatePlayingState,
    ]
  );

  // 上一首
  const playPrev = useCallback(async () => {
    if (songList && currentSongIndex !== null) {
      const prevIndex =
        (currentSongIndex - 1 + songList.songs.length) % songList.songs.length;
      await playSongAtIndexImplementation(prevIndex, true);
    } else if (songList && songList.songs.length > 0) {
      await playSongAtIndexImplementation(songList.songs.length - 1, true);
    }
  }, [songList, currentSongIndex, playSongAtIndexImplementation]);

  // 修复后的歌词点击跳转
  const handleLyricClick = useCallback(
    async (lineIndex: number) => {
      const line = currentLyrics[lineIndex];
      if (line && !isNaN(line.time)) {
        if (isPlayingRef.current) {
          // 如果正在播放，跳转并继续播放
          await seekInCurrentSong(line.time, true);
        } else {
          // 如果没有播放，跳转并开始播放
          if (isReadyToPlay()) {
            await seekInCurrentSong(line.time, true);
          } else if (currentSongIndex !== null) {
            await playSongAtIndexImplementation(
              currentSongIndex,
              true,
              line.time
            );
          }
        }
        setCurrentLineIndex(lineIndex);
      }
    },
    [
      currentLyrics,
      currentSongIndex,
      seekInCurrentSong,
      isReadyToPlay,
      playSongAtIndexImplementation,
    ]
  );

  // 音量控制
  const handleVolumeChange = useCallback((newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolume(clampedVolume);
    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.setValueAtTime(
        clampedVolume,
        audioContextRef.current.currentTime
      );
    }
  }, []);

  // 倍速控制
  const handlePlaybackRateChange = useCallback(
    (newRate: number) => {
      const clampedRate = Math.max(0.25, Math.min(4, newRate));

      // 如果正在播放，需要重新计算时间基准
      if (isPlayingRef.current && audioContextRef.current) {
        const elapsed =
          (audioContextRef.current.currentTime - startTimeRef.current) *
          playbackRate;
        pauseTimeRef.current += elapsed;
      }

      setPlaybackRate(clampedRate);

      // 如果正在播放，直接更新当前 source 的播放速率
      if (audioSourceRef.current && audioContextRef.current) {
        audioSourceRef.current.playbackRate.setValueAtTime(
          clampedRate,
          audioContextRef.current.currentTime
        );
        // 重置 startTimeRef 为当前时间基准
        startTimeRef.current = audioContextRef.current.currentTime;
      }
    },
    [playbackRate]
  );

  // 同步 isPlayingRef
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // 歌词同步
  useEffect(() => {
    if (currentLyrics.length > 0) {
      const newLineIndex = findCurrentLyricLine(currentTime, currentLyrics);
      if (newLineIndex !== -1 && newLineIndex !== currentLineIndex) {
        setCurrentLineIndex(newLineIndex);
      }
    }
  }, [currentTime, currentLyrics, currentLineIndex, findCurrentLyricLine]);

  // 音量变化处理
  useEffect(() => {
    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.setValueAtTime(
        volume,
        audioContextRef.current.currentTime
      );
    }
  }, [volume]);

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

  // 返回一个兼容的audioRef用于向后兼容
  const audioRef = useRef<HTMLAudioElement | null>(null);

  return {
    audioRef, // 保持向后兼容
    currentSong,
    currentSongIndex,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    currentLineIndex,
    currentLyrics,
    volume,
    playbackRate,
    // 循环播放相关状态和方法
    isLooping,
    handleLoopModeChange,
    togglePlay,
    playNext: playNextImplementation,
    playPrev,
    seek,
    handleLyricClick,
    playSongAtIndex: (index: number) =>
      playSongAtIndexImplementation(index, true),
    onVolumeChange: handleVolumeChange,
    onPlaybackRateChange: handlePlaybackRateChange,
    // 新增的Web Audio API相关的引用
    audioContextRef,
    gainNodeRef,
    analyserRef,
  };
}
