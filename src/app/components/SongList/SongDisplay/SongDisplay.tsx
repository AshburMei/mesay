"use client";
import React from "react";
import { SimpleSong } from "@/types/songlist-types/songsitem";
import "./SongDisplay.scss";

interface SongDisplayProps {
  currentSong: SimpleSong | null;
}

export default function SongDisplay({ currentSong }: SongDisplayProps) {
  // 格式化时间显示
  const formatDuration = (timelen?: number) => {
    if (!timelen) return "--:--";
    const minutes = Math.floor(timelen / 60000);
    const seconds = Math.floor((timelen % 60000) / 1000);
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  if (!currentSong) {
    return (
      <div className="song-display">
        <div className="no-song">
          <span className="music-icon">🎶</span>
          <p>请选择一首歌</p>
        </div>
      </div>
    );
  }

  return (
    <div className="song-display">
      <div className="song-info">
        <img
          src={
            currentSong.cover?.replace("{size}", "400") || "/default-cover.jpg"
          }
          alt={currentSong.name}
          className="cover-image"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "/default-cover.jpg";
          }}
        />
        <div className="song-details">
          <h2 className="song-title">{currentSong.name}</h2>
          {currentSong.remark && (
            <p className="artist-name">{currentSong.remark}</p>
          )}
          <div className="song-meta">
            {currentSong.timelen && (
              <span className="duration">
                时长: {formatDuration(currentSong.timelen)}
              </span>
            )}
            {currentSong.publish_date && (
              <span className="publish-date">
                发布: {currentSong.publish_date}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
