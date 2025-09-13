"use client";
import React, { useEffect, useRef, useState } from "react";
import { LyricLine } from "@/types/songlist-types/songsitem";
import "./SongLyrics.scss";

interface SongLyricsProps {
  lyrics: LyricLine[];
  currentLineIndex: number;
  onLyricClick: (lineIndex: number) => void;
}

export default function SongLyrics({
  lyrics = [],
  currentLineIndex,
  onLyricClick,
}: SongLyricsProps) {
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 自动滚动到当前歌词行
  useEffect(() => {
    if (
      activeLineRef.current &&
      lyricsContainerRef.current &&
      !isUserScrolling
    ) {
      const container = lyricsContainerRef.current;
      const activeLine = activeLineRef.current;

      const containerHeight = container.clientHeight;
      const activeLineTop = activeLine.offsetTop;
      const activeLineHeight = activeLine.clientHeight;

      // 计算目标滚动位置，让当前歌词显示在容器中央
      const targetScrollTop =
        activeLineTop - containerHeight / 2 + activeLineHeight / 2;

      // 平滑滚动到目标位置
      container.scrollTo({
        top: Math.max(0, targetScrollTop),
      });
    }
  }, [currentLineIndex, isUserScrolling]);

  // 点击歌词行
  const handleLyricClick = (lineIndex: number) => {
    onLyricClick(lineIndex);
  };

  // 清理定时器
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  if (!lyrics || lyrics.length === 0) {
    return (
      <div className="song-lyrics">
        <div className="no-lyrics">
          <p>暂无歌词</p>
        </div>
      </div>
    );
  }

  return (
    <div className="song-lyrics simple-mode">
      <div className="lyrics-container" ref={lyricsContainerRef}>
        {/* 顶部占位 */}
        <div className="lyrics-spacer top"></div>

        {lyrics.map((line, index) => (
          <div
            key={index}
            ref={index === currentLineIndex ? activeLineRef : null}
            className={`lyric-line ${index === currentLineIndex ? "current" : ""}`}
            onClick={() => handleLyricClick(index)}
          >
            <span className="lyric-text">{line.text}</span>
          </div>
        ))}

        {/* 底部占位 */}
        <div className="lyrics-spacer bottom"></div>
      </div>
    </div>
  );
}
