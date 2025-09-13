"use client";
import React, { useState, useCallback, useRef, useEffect } from "react";
import "./PlayerControls.scss";

interface PlayerControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onPlaybackRateChange: (rate: number) => void;
  volume: number;
  playbackRate: number;
  // 单曲循环相关props
  isLooping: boolean;
  onLoopToggle: () => void;
}

const formatTime = (time: number): string => {
  if (isNaN(time) || !isFinite(time)) return "00:00";
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
};

export default function PlayerControls({
  isPlaying,
  currentTime,
  duration,
  onPlayPause,
  onNext,
  onPrev,
  onSeek,
  onVolumeChange,
  onPlaybackRateChange,
  volume,
  playbackRate,
  isLooping,
  onLoopToggle,
}: PlayerControlsProps) {
  // 拖拽相关状态
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const progressBarRef = useRef<HTMLInputElement>(null);

  // 拖拽时显示拖拽时间，否则显示实际播放时间
  const displayTime = isDragging ? dragTime : currentTime;
  const validDuration = duration && isFinite(duration) ? duration : 0;
  const validDisplayTime =
    displayTime && isFinite(displayTime) ? displayTime : 0;

  // 动态更新进度条样式
  useEffect(() => {
    if (progressBarRef.current && validDuration > 0) {
      const progress = (validDisplayTime / validDuration) * 100;
      const progressBar = progressBarRef.current;

      // 设置渐变背景
      progressBar.style.background = `linear-gradient(
        to right,
        #1db954 0%,
        #1ed760 ${Math.max(0, progress - 2)}%,
        #1db954 ${progress}%,
        rgba(255, 255, 255, 0.1) ${progress}%,
        rgba(255, 255, 255, 0.1) 100%
      )`;
    }
  }, [validDisplayTime, validDuration]);

  // 进度条拖拽开始
  const handleSeekStart = useCallback(() => {
    setIsDragging(true);
    setDragTime(currentTime);
  }, [currentTime]);

  // 进度条拖拽中 - 修复关键点
  const handleSeekChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      if (!isNaN(time) && isFinite(time)) {
        setDragTime(time);
        // 在拖拽过程中不立即调用 onSeek，只更新显示
      }
    },
    []
  );

  // 处理进度条拖拽结束 - 修复关键点
  const handleSeekEnd = useCallback(() => {
    if (isDragging) {
      // 只在拖拽结束时调用一次 onSeek
      onSeek(dragTime);
      setIsDragging(false);
    }
  }, [isDragging, dragTime, onSeek]);

  // 处理进度条点击（非拖拽） - 新增
  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLInputElement>) => {
      if (!isDragging && validDuration > 0) {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickRatio = clickX / rect.width;
        const clickTime = clickRatio * validDuration;

        if (!isNaN(clickTime) && isFinite(clickTime)) {
          const clampedTime = Math.max(0, Math.min(clickTime, validDuration));
          onSeek(clampedTime);
        }
      }
    },
    [isDragging, validDuration, onSeek]
  );

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    if (!isNaN(vol)) {
      onVolumeChange(vol);
    }
  };

  const handleRateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const rate = parseFloat(e.target.value);
    if (!isNaN(rate)) {
      onPlaybackRateChange(rate);
    }
  };

  return (
    <div className="player-controls">
      <div className="controls-container">
        <div className="buttons">
          <button
            type="button"
            className={`control-btn loop-btn ${isLooping ? "loop-active" : "loop-inactive"}`}
            onClick={onLoopToggle}
            title={isLooping ? "关闭单曲循环" : "开启单曲循环"}
          >
            🔂
          </button>

          <button
            type="button"
            className="control-btn prev-btn"
            onClick={onPrev}
            title="上一首"
          >
            {"⏮"}
          </button>
          <button
            type="button"
            className="control-btn play-pause-btn"
            onClick={onPlayPause}
            title={isPlaying ? "暂停" : "播放"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button
            type="button"
            className="control-btn next-btn"
            onClick={onNext}
            title="下一首"
          >
            {"⏭"}
          </button>
          {/* 倍速 */}
          <div className="rate-control">
            <label>
              <select value={playbackRate} onChange={handleRateChange}>
                <option value={0.5}>0.5x</option>
                <option value={0.75}>0.75x</option>
                <option value={1}>1x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2x</option>
              </select>
            </label>
          </div>
        </div>

        {/* 进度条 */}
        <div className="progress-section">
          <span className="time-display current-time">
            {formatTime(validDisplayTime)}
          </span>
          <div className="progress-container">
            <input
              ref={progressBarRef}
              type="range"
              className={`progress-bar ${isDragging ? "dragging" : ""}`}
              min={0}
              max={validDuration}
              value={validDisplayTime}
              step={0.1}
              onChange={handleSeekChange}
              onMouseDown={handleSeekStart}
              onMouseUp={handleSeekEnd}
              onTouchStart={handleSeekStart}
              onTouchEnd={handleSeekEnd}
              onClick={handleProgressClick}
              disabled={!validDuration}
            />
          </div>
          <span className="time-display total-time">
            {formatTime(validDuration)}
          </span>
        </div>

        {/* 音量调节 */}
        <div className="volume-control">
          <label>
            🔊
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={handleVolumeChange}
            />
          </label>
          <div className="volume-display">{Math.round(volume * 100)}</div>
        </div>
      </div>
    </div>
  );
}
